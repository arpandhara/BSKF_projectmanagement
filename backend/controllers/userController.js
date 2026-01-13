import User from "../models/User.js";
import { createClerkClient } from '@clerk/clerk-sdk-node';

// @desc    Get all users (Team members)
// @route   GET /api/users
const getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-clerkId").lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// @desc    Change a user's role
// @route   PUT /api/users/:id/role
// @access  Admin Only
const updateUserRole = async (req, res) => {
  const { role } = req.body; // 'admin', 'member', or 'viewer'
  const { id } = req.params; // The MongoDB _id of the user to update

  try {
    // 1. Find user in MongoDB to get their Clerk ID
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 2. Update Clerk Metadata (This is what actually controls permission)
    await clerkClient.users.updateUserMetadata(user.clerkId, {
      publicMetadata: {
        role: role
      }
    });

    // 3. Update MongoDB (For display consistency)
    user.role = role;
    await user.save();

    res.json({ message: `User promoted to ${role}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update role" });
  }
};

// @desc    Toggle user availability status
// @route   PUT /api/users/status
// @access  Authenticated User
const toggleAvailabilityStatus = async (req, res) => {
  const userId = req.auth.userId; // Clerk user ID from auth middleware
  const { status } = req.body; // 'active' or 'on_leave'

  try {
    // Validate status
    if (!['active', 'on_leave'].includes(status)) {
      return res.status(400).json({ message: "Invalid status value" });
    }

    // Update user status in MongoDB
    const user = await User.findOneAndUpdate(
      { clerkId: userId },
      { availabilityStatus: status },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Emit socket event for real-time updates
    const io = req.app.get("io");
    if (io) {
      // 1. Try to get Org ID from request
      let targetOrgIds = [];

      // Priority 1: Check request body (most reliable)
      if (req.body.orgId) {
        targetOrgIds.push(req.body.orgId);
        console.log(`📍 Added req.body.orgId to targets: ${req.body.orgId}`);
      }

      // Priority 2: Check auth context
      if (req.auth.orgId && !targetOrgIds.includes(req.auth.orgId)) {
        targetOrgIds.push(req.auth.orgId);
        console.log(`📍 Added req.auth.orgId to targets: ${req.auth.orgId}`);
      }

      // 2. If no Org ID in auth (or to be safe), fetch all orgs for this user
      try {
        const memberships = await clerkClient.users.getOrganizationMembershipList({ userId: user.clerkId });
        console.log(`🔍 Clerk API response:`, memberships);

        if (memberships && Array.isArray(memberships.data)) {
          const memberOrgIds = memberships.data.map(m => m.organization.id);
          targetOrgIds = [...new Set([...targetOrgIds, ...memberOrgIds])]; // Unique IDs
          console.log(`✅ Found ${memberOrgIds.length} orgs from Clerk:`, memberOrgIds);
        } else if (memberships && Array.isArray(memberships)) {
          // Sometimes the response IS the array directly
          const memberOrgIds = memberships.map(m => m.organization.id);
          targetOrgIds = [...new Set([...targetOrgIds, ...memberOrgIds])];
          console.log(`✅ Found ${memberOrgIds.length} orgs from Clerk (direct array):`, memberOrgIds);
        } else {
          console.warn(`⚠️ Unexpected Clerk API response format:`, typeof memberships);
        }
      } catch (err) {
        console.error("⚠️ Failed to fetch user orgs for broadcast:", err);
      }

      if (targetOrgIds.length === 0) {
        console.warn("⚠️ No organizations found to broadcast status change.");
      } else {
        console.log(`🎯 Final targetOrgIds:`, targetOrgIds);
      }

      // 3. Broadcast to ALL identified organizations
      targetOrgIds.forEach(orgId => {
        // Broadcast to "org_org_123" (Double prefix logic used in join_org)
        io.to(`org_${orgId}`).emit("user:status_changed", {
          userId: user.clerkId,
          status: user.availabilityStatus,
          userName: `${user.firstName} ${user.lastName}`,
          timestamp: new Date()
        });

        // Broadcast to "org_123" (Single prefix just in case)
        io.to(orgId).emit("user:status_changed", {
          userId: user.clerkId,
          status: user.availabilityStatus,
          userName: `${user.firstName} ${user.lastName}`,
          timestamp: new Date()
        });
      });

      // If user went on leave, notify admins
      console.log(`🔔 Check for Admin Notifications: Status=${status}, OrgId=${req.auth.orgId}`);

      if (status === "on_leave") {
        // Decide which orgs to notify. Use targetOrgIds to cover all bases.
        const orgsToNotify = targetOrgIds.length > 0 ? targetOrgIds : (req.auth.orgId ? [req.auth.orgId] : []);

        console.log(`📢 Will notify admins in orgs: ${orgsToNotify.join(", ")}`);

        // We need to find admins for THESE specific orgs.
        // Since User model 'role' is simple, let's use Clerk to be accurate if possible, 
        // OR just notify all 'admin' role users in DB (Simple approach)

        // SIMPLE APPROACH (Legacy): Notify all global admins
        // Problem: If I am in Org A, I shouldn't notify Admin of Org B.
        // But if User model doesn't link user to Org, we can't filter by Org in Mongo.

        // BETTER APPROACH: Fetch admins from Clerk for the target orgs
        for (const targetOrgId of orgsToNotify) {
          try {
            const orgAdmins = await clerkClient.organizations.getOrganizationMembershipList({
              organizationId: targetOrgId,
              limit: 100,
            });

            // Handle both response formats: direct array or {data: array}
            const members = Array.isArray(orgAdmins) ? orgAdmins : (orgAdmins?.data || []);

            // Filter for admins
            const adminUserIds = members
              .filter(mem => mem.role === "org:admin")
              .map(mem => mem.publicUserData.userId);

            console.log(`👥 Found ${adminUserIds.length} admins in ${targetOrgId}: ${adminUserIds.join(", ")}`);

            if (adminUserIds.length === 0) {
              console.warn(`⚠️ No admins found in org ${targetOrgId}`);
              continue;
            }

            const Notification = (await import("../models/Notification.js")).default;

            for (const adminId of adminUserIds) {
              // Don't notify self
              if (adminId === user.clerkId) continue;

              const notification = await Notification.create({
                userId: adminId,
                message: `${user.firstName} ${user.lastName} has marked themselves as On Leave`,
                type: "INFO",
                read: false
              });

              io.to(`user_${adminId}`).emit("notification:new", notification);
              console.log(`📨 Sent notification to admin ${adminId}`);
            }
          } catch (err) {
            console.error(`⚠️ Failed to notify admins of org ${targetOrgId}:`, err);
          }
        }
      }

      console.log(`✅ User status updated to: ${status}`);
    }

    res.json({
      message: "Status updated successfully",
      status: user.availabilityStatus
    });
  } catch (error) {
    console.error("Error updating availability status:", error);
    res.status(500).json({ message: "Failed to update status" });
  }
};

// @desc    Get user availability status
// @route   GET /api/users/:userId/status
// @access  Authenticated User
const getUserStatus = async (req, res) => {
  const { userId } = req.params; // Clerk user ID

  try {
    const user = await User.findOne({ clerkId: userId }).select('availabilityStatus firstName lastName');

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      userId: userId,
      status: user.availabilityStatus,
      userName: `${user.firstName} ${user.lastName}`
    });
  } catch (error) {
    console.error("Error fetching user status:", error);
    res.status(500).json({ message: "Failed to fetch status" });
  }
};

export { getUsers, updateUserRole, toggleAvailabilityStatus, getUserStatus };