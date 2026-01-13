import AdminRequest from "../models/AdminRequest.js";
import User from "../models/User.js"; // Import User model to update MongoDB
import { createClerkClient } from '@clerk/clerk-sdk-node';
import dotenv from "dotenv";
import Project from "../models/Project.js";
import Task from "../models/Task.js";
import Notification from "../models/Notification.js";
dotenv.config();

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// @desc    Request to demote an admin
const requestDemotion = async (req, res) => {
  const { targetUserId } = req.body;
  const requesterId = req.auth.userId;
  
  const orgId = req.auth.orgId || req.body.orgId; 

  if (!orgId) return res.status(400).json({ message: "Organization ID required" });

  try {
    const existing = await AdminRequest.findOne({ 
      targetUserId, 
      orgId, 
      status: 'PENDING' 
    });

    if (existing) {
      return res.status(400).json({ message: "A request for this user is already pending." });
    }

    await AdminRequest.create({
      targetUserId,
      requesterUserId: requesterId,
      orgId
    });

    res.json({ message: "Demotion requested. Waiting for another admin to approve." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve a demotion request (Updates Org, Metadata, and MongoDB)
const approveDemotion = async (req, res) => {
  const { requestId } = req.params;
  const approverId = req.auth.userId;
  const io = req.app.get("io"); // Get Socket IO

  try {
    const request = await AdminRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });

    if (request.requesterUserId === approverId) {
      return res.status(403).json({ message: "You cannot approve your own request." });
    }

    // 1. Clerk & DB Updates
    await clerkClient.organizations.updateOrganizationMembership({
      organizationId: request.orgId,
      userId: request.targetUserId,
      role: "org:member"
    });

    await clerkClient.users.updateUserMetadata(request.targetUserId, {
      publicMetadata: { role: "member" }
    });

    await User.findOneAndUpdate({ clerkId: request.targetUserId }, { role: "member" });
    await AdminRequest.findByIdAndDelete(requestId);

    // 2. Create Notification
    const note = await Notification.create({
        userId: request.targetUserId,
        message: "Your role has been updated to: Member",
        type: "INFO",
        read: false
    });

    // 3. SOCKET EVENTS
    if (io) {
        // Notify the user
        io.to(`user_${request.targetUserId}`).emit("notification:new", note);
        // Force user to refresh session (update permissions)
        io.to(`user_${request.targetUserId}`).emit("session:refresh");
        // Update everyone's Team List
        io.to(`org_${request.orgId}`).emit("team:update");
    }

    res.json({ message: "Demotion approved and executed." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to execute demotion." });
  }
};

// @desc    Get pending requests
const getPendingRequests = async (req, res) => {
  try {
    const orgId = req.auth.orgId || req.query.orgId;
    
    if (!orgId) return res.json([]); 

    const requests = await AdminRequest.find({ orgId }).lean(); // .lean() converts to plain JS object so we can add properties

    const enhancedRequests = await Promise.all(requests.map(async (request) => {
      const requester = await User.findOne({ clerkId: request.requesterUserId }).select("firstName lastName");
      
      let target = null;
      if (request.targetUserId) {
        target = await User.findOne({ clerkId: request.targetUserId }).select("firstName lastName");
      }

      return {
        ...request,
        requesterName: requester ? `${requester.firstName} ${requester.lastName}` : "Unknown Admin",
        targetName: target ? `${target.firstName} ${target.lastName}` : request.targetUserId
      };
    }));

    res.json(enhancedRequests);
  } catch (error) {
    console.error("Error fetching requests:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Promote a member to Admin (Updates Org, Metadata, and MongoDB)
const promoteMember = async (req, res) => {
  const { targetUserId } = req.body;
  const orgId = req.auth.orgId || req.body.orgId;
  const io = req.app.get("io");

  try {
    await clerkClient.organizations.updateOrganizationMembership({
      organizationId: orgId,
      userId: targetUserId,
      role: "org:admin"
    });

    await clerkClient.users.updateUserMetadata(targetUserId, {
      publicMetadata: { role: "admin" }
    });

    await User.findOneAndUpdate({ clerkId: targetUserId }, { role: "admin" });

    // Create Notification
    const note = await Notification.create({
        userId: targetUserId,
        message: "Congratulations! You have been promoted to Admin.",
        type: "INFO",
        read: false
    });

    if (io) {
        io.to(`user_${targetUserId}`).emit("notification:new", note);
        io.to(`user_${targetUserId}`).emit("session:refresh");
        io.to(`org_${orgId}`).emit("team:update");
    }

    res.json({ message: "Member promoted successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to promote member." });
  }
};


const requestOrgDeletion = async (req, res) => {
  const requesterId = req.auth.userId;
  const orgId = req.auth.orgId || req.body.orgId;

  if (!orgId) return res.status(400).json({ message: "Organization ID required" });

  try {
    // Check if request already exists
    const existing = await AdminRequest.findOne({ 
      orgId, 
      type: 'DELETE_ORG',
      status: 'PENDING' 
    });

    if (existing) {
      return res.status(400).json({ message: "A deletion request for this organization is already pending." });
    }

    await AdminRequest.create({
      requesterUserId: requesterId,
      orgId,
      type: 'DELETE_ORG'
    });

    res.json({ message: "Deletion requested. Waiting for another admin to approve." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const approveOrgDeletion = async (req, res) => {
  const { requestId } = req.params;
  const approverId = req.auth.userId;

  try {
    const request = await AdminRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });

    if (request.type !== 'DELETE_ORG') return res.status(400).json({ message: "Invalid request type" });

    if (request.requesterUserId === approverId) {
      return res.status(403).json({ message: "You cannot approve your own deletion request." });
    }

    const orgId = request.orgId;

    // 1. Delete from Clerk
    await clerkClient.organizations.deleteOrganization(orgId);

    // Clean up Local DB (Projects & Tasks)
    // Find all projects in this org first
    const projects = await Project.find({ orgId });
    const projectIds = projects.map(p => p._id);

    // Delete tasks associated with these projects
    if (projectIds.length > 0) {
        await Task.deleteMany({ projectId: { $in: projectIds } });
    }
    
    // Delete the projects themselves
    await Project.deleteMany({ orgId });

    // Delete All Pending Requests for this Org (cleanup)
    await AdminRequest.deleteMany({ orgId });

    res.json({ message: "Organization deleted successfully." });
  } catch (error) {
    console.error("Org Deletion Error:", error);
    res.status(500).json({ message: "Failed to delete organization." });
  }
};

const rejectRequest = async (req, res) => {
  const { requestId } = req.params;
  try {
    const request = await AdminRequest.findById(requestId);
    if (!request) return res.status(404).json({ message: "Request not found" });

    // Deleting the request effectively denies it
    await AdminRequest.findByIdAndDelete(requestId);

    res.json({ message: "Request denied and removed." });
  } catch (error) {
    console.error("Reject Error:", error);
    res.status(500).json({ message: "Failed to reject request." });
  }
};

export { requestDemotion, approveDemotion, getPendingRequests , promoteMember , requestOrgDeletion , approveOrgDeletion , rejectRequest };