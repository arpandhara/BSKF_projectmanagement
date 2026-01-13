import Project from "../models/Project.js";
import User from "../models/User.js";
import Task from "../models/Task.js";
import Notification from "../models/Notification.js";
import Event from "../models/Event.js";
import Activity from "../models/Activity.js";
import { deleteFileFromUrl } from "../utils/supabase.js";
import { createClerkClient } from "@clerk/clerk-sdk-node";

// @desc    Get all projects
const getProjects = async (req, res) => {
  try {
    const { userId } = req.auth;
    const orgId = req.auth.orgId || req.query.orgId;
    let query;
    const targetUserId = req.query.userId || userId;

    if (orgId && orgId !== "undefined" && orgId !== "null") {
      query = { orgId, members: targetUserId };
    } else {
      query = {
        ownerId: userId,
        orgId: { $exists: false },
      };
    }

    const projects = await Project.find(query).sort({ createdAt: -1 }).lean();
    res.json(projects);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error: Could not fetch projects" });
  }
};

// @desc    Get single project by ID
const getProjectById = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).lean();
    if (project) {
      res.json(project);
    } else {
      res.status(404).json({ message: "Project not found" });
    }
  } catch (error) {
    console.error(error);
    if (error.kind === "ObjectId") {
      return res.status(404).json({ message: "Project not found" });
    }
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Create a new project
const createProject = async (req, res) => {
  try {
    const { title, description, status, priority, startDate, dueDate } =
      req.body;
    const { userId } = req.auth;
    const orgId = req.body.orgId || req.auth.orgId;

    const project = new Project({
      title,
      description: description || "No Description",
      status,
      priority,
      startDate,
      dueDate,
      ownerId: userId,
      orgId:
        orgId && orgId !== "undefined" && orgId !== "null" ? orgId : undefined,
      members: [userId],
    });

    const createdProject = await project.save();
    res.status(201).json(createdProject);
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: "Invalid project data" });
  }
};

// @desc    Delete a project
const deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: 'Project not found' });

    const orgId = project.orgId;

    //Find all tasks to get their IDs and attachments
    const tasks = await Task.find({ projectId: project._id });
    const taskIds = tasks.map(t => t._id);

    //Gather all file URLs (from Task Attachments & Activity Logs)
    const fileDeletePromises = [];

    // From Task Attachments
    tasks.forEach(task => {
        task.attachments?.forEach(att => {
            if(att.url) fileDeletePromises.push(deleteFileFromUrl(att.url));
        });
    });

    // From Activities
    const activities = await Activity.find({ taskId: { $in: taskIds } });
    
    activities.forEach(act => {
        if (act.type === 'UPLOAD' && act.metadata?.fileUrl) {
            fileDeletePromises.push(deleteFileFromUrl(act.metadata.fileUrl));
        }
    });

    // EXECUTE EVERYTHING IN PARALLEL
    await Promise.all([
        ...fileDeletePromises,
        Activity.deleteMany({ taskId: { $in: taskIds } }), 
        Task.deleteMany({ projectId: project._id }),       
        Event.deleteMany({ projectId: project._id }),     
        project.deleteOne()                                
    ]);

    // 4. Socket Broadcast
    const io = req.app.get("io");
    if (io && orgId) {
      io.to(`org_${orgId}`).emit("project:deleted", req.params.id);
    }

    res.json({ message: 'Project and all associated data removed' });
  } catch (error) {
    console.error("Delete Project Error:", error);
    res.status(500).json({ message: 'Server Error: Could not delete project' });
  }
};

// @desc    Add a user to a project
// @route   PUT /api/projects/:id/members
const addProjectMember = async (req, res) => {
  try {
    const { email } = req.body;
    const project = await Project.findById(req.params.id);

    if (!project) return res.status(404).json({ message: "Project not found" });

    const userToAdd = await User.findOne({ email });

    if (!userToAdd) {
      return res.status(404).json({ message: "User not found in the system." });
    }

    // Organization Check
    if (project.orgId) {
      const clerkClient = createClerkClient({
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      try {
        const response =
          await clerkClient.organizations.getOrganizationMembershipList({
            organizationId: project.orgId,
            userId: userToAdd.clerkId,
          });
        const memberships = Array.isArray(response) ? response : response.data;
        const isActuallyMember =
          memberships &&
          memberships.some((mem) => {
            const memId =
              mem.publicUserData?.userId || mem.public_user_data?.user_id;
            return memId === userToAdd.clerkId;
          });

        if (!memberships || memberships.length === 0 || !isActuallyMember) {
          return res.status(400).json({
            message: "User is not in the Organization's Core Team.",
          });
        }
      } catch (error) {
        return res
          .status(400)
          .json({ message: "Could not verify organization membership." });
      }
    }

    if (project.members.includes(userToAdd.clerkId)) {
      return res.status(400).json({ message: "User is already a member" });
    }

    project.members.push(userToAdd.clerkId);
    await project.save();

    // Create Notification
    const note = await Notification.create({
      userId: userToAdd.clerkId,
      message: `You have been added to the project: "${project.title}"`,
      type: "PROJECT_ADD",
      projectId: project._id,
    });

    // Broadcast updates
    const io = req.app.get("io");
    if (io) {
      // Notify the specific user they were added
      io.to(`user_${userToAdd.clerkId}`).emit("notification:new", note);

      // Update the project room (so the member list updates live for everyone)
      io.to(`project_${project._id}`).emit("project:updated", project);
    }

    res.json({ message: "Member added", member: userToAdd });
  } catch (error) {
    console.error("Server Error in addProjectMember:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Get members of a specific project
const getProjectMembers = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ message: "Project not found" });

    const members = await User.find({
      clerkId: { $in: project.members },
    }).select("firstName lastName email photo clerkId").lean();

    res.json(members);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

const updateProjectSettings = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status } = req.body;

    const project = await Project.findById(id);
    if (!project) return res.status(404).json({ message: "Project not found" });

    project.title = title || project.title;
    project.description = description || project.description;
    project.status = status || project.status; // <--- Added this

    await project.save();

    res.json(project);
  } catch (error) {
    console.error("Update failed:", error); // Log error for debugging
    res.status(500).json({ message: "Update failed" });
  }
};

// 👇 NEW: Remove Member (Admin Only)
const removeProjectMember = async (req, res) => {
  try {
    const { id } = req.params; // Project ID
    const { userId } = req.body; // Member to remove

    const project = await Project.findById(id);
    if (!project) return res.status(404).json({ message: "Project not found" });

    project.members = project.members.filter((m) => m !== userId);
    await project.save();

    const io = req.app.get("io");
    if (io) {
      // Kick the user out of the project room live
      io.to(`project_${id}`).emit("project:member_removed", userId);
      io.to(`project_${id}`).emit("project:updated", project);
    }

    res.json({ message: "Member removed" });
  } catch (error) {
    res.status(500).json({ message: "Failed to remove member" });
  }
};

// 👇 NEW: Create Event (G-Meet)
const createProjectEvent = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, startDate, meetLink } = req.body;

    const event = await Event.create({
      projectId: id,
      title,
      startDate,
      meetLink,
      createdBy: req.auth.userId,
    });

    const io = req.app.get("io");
    if (io) {
      io.to(`project_${id}`).emit("event:created", event);
    }

    res.status(201).json(event);
  } catch (error) {
    res.status(500).json({ message: "Failed to create event" });
  }
};

// 👇 NEW: Get Events
const getProjectEvents = async (req, res) => {
  try {
    const { id } = req.params;
    // Get upcoming events
    const events = await Event.find({
      projectId: id,
      startDate: { $gte: new Date() }, // Only future events
    }).sort({ startDate: 1 }).lean();

    res.json(events);
  } catch (error) {
    res.status(500).json({ message: "Failed to load events" });
  }
};

export {
  getProjects,
  getProjectById,
  createProject,
  deleteProject,
  addProjectMember,
  getProjectMembers,
  updateProjectSettings,
  removeProjectMember,
  createProjectEvent,
  getProjectEvents,
};