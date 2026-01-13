import { Webhook } from "svix";
import User from "../models/User.js";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import { createClerkClient } from '@clerk/clerk-sdk-node';
import dotenv from "dotenv";

dotenv.config();

// Initialize Clerk to update Metadata
const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export const clerkWebhook = async (req, res) => {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error("Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local");
  }

  // Get the Headers
  const svix_id = req.headers["svix-id"];
  const svix_timestamp = req.headers["svix-timestamp"];
  const svix_signature = req.headers["svix-signature"];

  if (!svix_id || !svix_timestamp || !svix_signature) {
    return res.status(400).send("Error occurred -- no svix headers");
  }

  // Verify Payload
  const payload = req.rawBody;
  const wh = new Webhook(WEBHOOK_SECRET);
  let evt;

  try {
    evt = wh.verify(payload, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    });
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return res.status(400).json({ "Error": err.message });
  }

  // Handle Events
  const eventType = evt.type;
  const data = evt.data;

  console.log(`Webhook received: ${eventType}`);

  // ------------------------------------------------------------------
  // 1. USER EVENTS (Create/Update/Delete Users)
  // ------------------------------------------------------------------
  if (eventType === "user.created") {
    try {
      const primaryEmail = data.email_addresses?.[0]?.email_address;
      if (!primaryEmail) return res.status(200).json({ message: "No email found" });

      const newUser = new User({
        clerkId: data.id,
        email: primaryEmail,
        username: data.username || data.id,
        firstName: data.first_name || "",
        lastName: data.last_name || "",
        photo: data.image_url || "",
        role: "member" // Default to member
      });

      await newUser.save();
      console.log("✅ User created in DB");
    } catch (error) {
      if (error.code === 11000) return res.status(200).json({ message: "User exists" });
      console.error("❌ Error saving user:", error);
      return res.status(500).json({ message: "Database error" });
    }
  }

  else if (eventType === "user.updated") {
    try {
      const primaryEmail = data.email_addresses?.[0]?.email_address;
      await User.findOneAndUpdate(
        { clerkId: data.id },
        {
          ...(primaryEmail && { email: primaryEmail }),
          username: data.username,
          firstName: data.first_name,
          lastName: data.last_name,
          photo: data.image_url,
        }
      );
      console.log("✅ User updated in DB");
    } catch (error) {
      console.error("Error updating user:", error);
      return res.status(500).json({ message: "Database error" });
    }
  }

  else if (eventType === "user.deleted") {
    try {
      await User.findOneAndDelete({ clerkId: data.id });
      await Project.updateMany({}, { $pull: { members: data.id } });
      console.log("✅ User deleted from DB and Projects");
    } catch (error) {
      console.error("Error deleting user:", error);
      return res.status(500).json({ message: "Database error" });
    }
  }

  // ------------------------------------------------------------------
  // 2. MEMBERSHIP SYNC (Fixes the Bug: Role Persistence)
  // ------------------------------------------------------------------

  // CASE A: User Joins or Role Changes (Sync exact role)
  else if (eventType === "organizationMembership.created" || eventType === "organizationMembership.updated") {
    try {
      const userId = data.public_user_data?.user_id;
      const orgRole = data.role; // e.g., "org:admin" or "org:member"

      // Determine Global Role based on Org Role
      const newGlobalRole = (orgRole === "org:admin") ? "admin" : "member";

      if (userId) {
        // 1. Update MongoDB
        await User.findOneAndUpdate({ clerkId: userId }, { role: newGlobalRole });

        // 2. Update Clerk Metadata (So frontend UI updates immediately)
        await clerkClient.users.updateUserMetadata(userId, {
          publicMetadata: { role: newGlobalRole }
        });

        // 3. Notify Team List to Update
        const io = req.app.get("io");
        if (io) {
          const orgId = data.organization?.id;
          console.log(`🔔 Webhook: Attempting to emit team:update to org_${orgId}`);
          if (orgId) {
            io.to(`org_${orgId}`).emit("team:update");
            console.log(`✅ Webhook: Emitted team:update to org_${orgId}`);
          } else {
            console.log("❌ Webhook: Org ID missing for team:update");
          }
        } else {
          console.log("❌ Webhook: Socket IO instance not found on req.app");
        }

        console.log(`🔄 Role Synced for ${userId}: Now ${newGlobalRole}`);
      }
    } catch (error) {
      console.error("❌ Error syncing membership role:", error);
      return res.status(500).json({ message: "Sync error" });
    }
  }

  // CASE B: User Left / Removed / Kicked (Downgrade to Member)
  else if (eventType === "organizationMembership.deleted") {
    try {
      const organizationId = data.organization?.id || data.organization_id;
      const userId = data.public_user_data?.user_id || data.user_id;

      if (userId) {
        // 1. Remove from Projects (Existing Logic)
        if (organizationId) {
          await Project.updateMany(
            { orgId: organizationId },
            { $pull: { members: userId } }
          );
        }

        // 2. 👇 NEW: Downgrade User to 'member' globally
        // This ensures if they are kicked, they lose Admin status immediately.
        await User.findOneAndUpdate({ clerkId: userId }, { role: "member" });

        await clerkClient.users.updateUserMetadata(userId, {
          publicMetadata: { role: "member" }
        });

        // 3. Notify Frontend to Refresh User Session
        const io = req.app.get("io");
        if (io) {
          io.to(`user_${userId}`).emit("session:refresh");

          // 4. Notify Team List to Update
          if (organizationId) {
            io.to(`org_${organizationId}`).emit("team:update");
          }
        }

        console.log(`🔻 User ${userId} removed from Org. Downgraded to Member.`);
      }
    } catch (error) {
      console.error("❌ Error processing membership deletion:", error);
      return res.status(500).json({ message: "Database error" });
    }
  }

  // ------------------------------------------------------------------
  // 3. ORGANIZATION EVENTS (Cleanup)
  // ------------------------------------------------------------------
  else if (eventType === "organization.deleted") {
    try {
      const orgId = data.id;
      if (!orgId) return res.status(200).json({ message: "Missing ID" });

      // Clean up Projects & Tasks
      const projects = await Project.find({ orgId });
      const projectIds = projects.map(p => p._id);

      if (projectIds.length > 0) {
        await Task.deleteMany({ projectId: { $in: projectIds } });
      }
      const projectResult = await Project.deleteMany({ orgId });

      console.log(`✅ Organization Deleted: Cleaned up ${projectResult.deletedCount} projects.`);

      // Note: We don't need to downgrade users here explicitly because 
      // Clerk usually fires 'organizationMembership.deleted' for members 
      // when the org is destroyed, which will trigger the logic above.

    } catch (error) {
      console.error("❌ Error syncing organization deletion:", error);
      return res.status(500).json({ message: "Database error" });
    }
  }

  return res.status(200).json({ success: true, message: "Webhook received" });
};