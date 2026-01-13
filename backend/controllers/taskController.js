import Task from "../models/Task.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import nodemailer from "nodemailer";
import Project from "../models/Project.js";
import Activity from "../models/Activity.js";
import { deleteFileFromUrl } from "../utils/supabase.js";


const escapeHtml = (unsafe) => {
  if (typeof unsafe !== 'string') return unsafe;
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

// @desc    Get tasks for a specific project
const getTasks = async (req, res) => {
  try {
    const { projectId } = req.params;
    const tasks = await Task.find({ projectId }).sort({ createdAt: -1 }).lean();
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

// @desc    Create a new task
const createTask = async (req, res) => {
  try {
    const task = new Task(req.body);
    const createdTask = await task.save();

    // Broadcast to Project Room (Fast enough to keep here)
    const io = req.app.get("io");
    if (io) {
      io.to(`project_${createdTask.projectId}`).emit("task:created", createdTask);
    }

    res.status(201).json(createdTask);

    // This runs asynchronously after the response is sent
    (async () => {
      try {
        if (createdTask.assignees && createdTask.assignees.length > 0) {
          const assigneesToNotify = createdTask.assignees.filter(
            (id) => id !== req.auth.userId
          );

          if (assigneesToNotify.length > 0) {
            //  In-App Notifications
            const notifications = assigneesToNotify.map((userId) => ({
              userId,
              message: `You have been assigned to task: "${createdTask.title}"`,
              type: "TASK_ASSIGN",
              projectId: createdTask.projectId,
            }));

            const savedNotifications = await Notification.insertMany(notifications);

            // Notify specific users
            if (io) {
              savedNotifications.forEach((note) => {
                io.to(`user_${note.userId}`).emit("notification:new", note);
              });
            }

            // Send Emails (The Heavy Operation)
            const usersToEmail = await User.find({
              clerkId: { $in: assigneesToNotify },
            });

            const transporter = nodemailer.createTransport({
              service: "gmail",
              auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
              },
            });

            const safeTitle = escapeHtml(createdTask.title);
            const safePriority = escapeHtml(createdTask.priority);

            
            await Promise.all(
              usersToEmail.map((user) => {
                if (!user.email) return;
                const safeName = escapeHtml(user.firstName || "Member");

                const mailOptions = {
                  from: `"Project Manager" <${process.env.EMAIL_USER}>`,
                  to: user.email,
                  subject: `New Task Assigned: ${safeTitle}`,
                  html: `
                    <div style="font-family: Arial, sans-serif; color: #333;">
                      <h2>New Task Assignment</h2>
                      <p>Hi <strong>${safeName}</strong>,</p>
                      <p>You have been assigned to a new task:</p>
                      <blockquote style="border-left: 4px solid #2563eb; padding-left: 10px; margin: 20px 0;">
                        <p><strong>Title:</strong> ${safeTitle}</p>
                        <p><strong>Priority:</strong> ${safePriority}</p>
                      </blockquote>
                      <p>Best regards,<br/>The Team</p>
                    </div>
                  `,
                };
                return transporter.sendMail(mailOptions);
              })
            );
          }
        }
      } catch (backgroundError) {
        console.error("⚠️ Background Notification Error:", backgroundError);
      }
    })();

  } catch (error) {
    console.error("Create Task Error:", error);
    // Only send error if haven't responded yet
    if (!res.headersSent) {
      res.status(400).json({ message: "Invalid task data" });
    }
  }
};

// @desc    Delete a task
const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const projectId = task.projectId;
    const assignees = task.assignees;

    // 1. GATHER FILES TO DELETE
    const filesToDelete = [];

    // A. From Task Attachments
    if (task.attachments && task.attachments.length > 0) {
      task.attachments.forEach(att => {
        if (att.url) filesToDelete.push(att.url);
      });
    }

    // B. From Activities (Uploads)
    const activities = await Activity.find({ taskId: task._id });
    activities.forEach(act => {
      if (act.type === 'UPLOAD' && act.metadata?.fileUrl) {
        filesToDelete.push(act.metadata.fileUrl);
      }
    });

    // 2. DELETE FILES FROM SUPABASE (Parallel)
    if (filesToDelete.length > 0) {
      console.log(`🗑️ Deleting ${filesToDelete.length} files for task...`);
      await Promise.all(filesToDelete.map(url => deleteFileFromUrl(url)));
    }

    // 3. DELETE ACTIVITY LOGS
    await Activity.deleteMany({ taskId: task._id });

    // 4. DELETE THE TASK
    await task.deleteOne();

    // 5. SOCKET EVENTS
    const io = req.app.get("io");
    if (io) {
      io.to(`project_${projectId}`).emit("task:deleted", req.params.id);
      assignees.forEach((userId) => {
        io.to(`user_${userId}`).emit("dashboard:update");
      });
    }

    res.json({ message: "Task and all associated data removed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getUserTasks = async (req, res) => {
  try {
    const { userId } = req.params;
    const tasks = await Task.find({ assignees: userId }).populate(
      "projectId",
      "title"
    ).lean();
    res.json(tasks);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getTaskById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.auth.userId;
    const isOrgAdmin = req.auth.orgRole === "org:admin";
    const isGlobalAdmin = req.auth.sessionClaims?.publicMetadata?.role === "admin";
    const isAdmin = isOrgAdmin || isGlobalAdmin;

    const task = await Task.findById(id).populate("projectId", "title ownerId").lean();

    if (!task) return res.status(404).json({ message: "Task not found" });

    const isAssignee = task.assignees.includes(userId);

    if (!isAdmin && !isAssignee) {
      return res
        .status(403)
        .json({ message: "Access Denied. You are not assigned to this task." });
    }

    res.json(task);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

const updateTask = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const userId = req.auth.userId;

    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    // 1. Detect Changes for Activity Log
    let activityLog = null;
    
    // Check Status Change
    if (updates.status && updates.status !== task.status) {
      activityLog = {
        type: 'STATUS_CHANGE',
        content: `changed status from "${task.status}" to "${updates.status}"`
      };
    }
    // Check Priority Change
    else if (updates.priority && updates.priority !== task.priority) {
        activityLog = {
          type: 'PRIORITY_CHANGE',
          content: `changed priority to "${updates.priority}"`
        };
    }

    // 2. CHECK FOR REMOVED ATTACHMENTS (Fix for Issue #1 & #2)
    if (updates.attachments) {
        const oldAttachments = task.attachments || [];
        const newAttachments = updates.attachments; // The new array sent from frontend

        // Identify attachments that are in 'old' but missing in 'new'
        const removedAttachments = oldAttachments.filter(oldAtt => 
            !newAttachments.some(newAtt => newAtt.url === oldAtt.url)
        );

        if (removedAttachments.length > 0) {
            console.log(`🗑️ Removing ${removedAttachments.length} attachments from storage...`);
            await Promise.all(removedAttachments.map(att => deleteFileFromUrl(att.url)));
        }
    }

    // 3. Apply updates
    Object.assign(task, updates);
    await task.save();

    const io = req.app.get("io");

    // 4. Create Activity Record if something changed
    if (activityLog) {
       const user = await User.findOne({ clerkId: userId });
       const newActivity = await Activity.create({
         taskId: task._id,
         userId,
         userName: user ? `${user.firstName} ${user.lastName}` : "Unknown",
         userPhoto: user?.photo,
         type: activityLog.type,
         content: activityLog.content
       });
       
       if (io) io.to(`project_${task.projectId}`).emit("task:activity", newActivity);
    }

    // 5. Notify Admin if marked DONE
    if (updates.status === "Done") {
      const project = await Project.findById(task.projectId);
      if (project) {
        const adminId = project.ownerId; 
        
        // Only notify if the person completing it is NOT the admin
        if (userId !== adminId) {
          const note = await Notification.create({
            userId: adminId,
            message: `Task "${task.title}" was marked as DONE. Please review for approval.`,
            type: "INFO",
            projectId: task.projectId,
            metadata: { taskId: task._id }
          });
          
          if (io) io.to(`user_${adminId}`).emit("notification:new", note);
        }
      }
    }

    // 6. Emit General Task Update
    if (io) {
      io.to(`project_${task.projectId}`).emit("task:updated", task);
    }

    res.json(task);
  } catch (error) {
    console.error("Update Error:", error);
    res.status(500).json({ message: "Failed to update task" });
  }
};

const inviteToTask = async (req, res) => {
  try {
    const { taskId } = req.params;
    const { targetUserId } = req.body;
    const senderId = req.auth.userId;

    const task = await Task.findById(taskId);
    if (!task) return res.status(404).json({ message: "Task not found" });

    const isAssignee = task.assignees.includes(senderId);
    const isAdmin = req.auth.orgRole === "org:admin";

    if (!isAssignee && !isAdmin) {
      return res.status(403).json({ message: "Only assignees can invite others." });
    }

    if (task.assignees.includes(targetUserId)) {
      return res.status(400).json({ message: "User is already assigned." });
    }

    // Create Notification
    const note = await Notification.create({
      userId: targetUserId,
      message: `Help Request: Please help with task "${task.title}"`,
      type: "TASK_INVITE",
      projectId: task.projectId,
      metadata: {
        taskId: task._id,
        senderId: senderId,
      },
    });

    // Notify target
    const io = req.app.get("io");
    if (io) {
      io.to(`user_${targetUserId}`).emit("notification:new", note);
    }

    res.json({ message: "Invitation sent successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

const respondToTaskInvite = async (req, res) => {
  try {
    const { notificationId, action } = req.body;
    const userId = req.auth.userId;

    const notification = await Notification.findById(notificationId);
    if (!notification) return res.status(404).json({ message: "Notification not found" });

    if (notification.userId !== userId) return res.status(403).json({ message: "Not authorized" });

    const { taskId, senderId } = notification.metadata || {};
    const io = req.app.get("io"); // Get IO instance

    if (action === "ACCEPT") {
      const updatedTask = await Task.findByIdAndUpdate(
        taskId, 
        { $addToSet: { assignees: userId } }, 
        { new: true } // Return updated doc
      );

      // Update project board with new assignee
      if (io) {
        io.to(`project_${notification.projectId}`).emit("task:updated", updatedTask);
      }

      // Notify Sender
      const replyNote = await Notification.create({
        userId: senderId,
        message: `Accepted: User has joined task`,
        type: "INFO",
        projectId: notification.projectId,
      });

      // Notify sender
      if (io) io.to(`user_${senderId}`).emit("notification:new", replyNote);

    } else {
      // Decline
      const replyNote = await Notification.create({
        userId: senderId,
        message: `Declined: User cannot help with task`,
        type: "INFO",
        projectId: notification.projectId,
      });

      // Notify sender
      if (io) io.to(`user_${senderId}`).emit("notification:new", replyNote);
    }

    await notification.deleteOne();
    res.json({ message: `Invitation ${action.toLowerCase()}ed` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server Error" });
  }
};

const approveTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment, adminName } = req.body;

    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    task.isApproved = true;
    task.approvedAt = new Date();
    
    // Add Approval Comment
    task.comments.push({
      userId: req.auth.userId,
      userName: adminName || "Admin",
      text: comment || "Task Approved. Scheduled for deletion in 15 days.",
      type: "APPROVAL"
    });

    await task.save();

    // Socket Update
    const io = req.app.get("io");
    if (io) io.to(`project_${task.projectId}`).emit("task:updated", task);

    // Notify Assignees
    const notifications = task.assignees.map(uid => ({
      userId: uid,
      message: `Task "${task.title}" APPROVED. It will be auto-deleted in 15 days.`,
      type: "INFO",
      projectId: task.projectId
    }));
    
    if (notifications.length > 0) {
      const savedNotes = await Notification.insertMany(notifications);
      if (io) {
        savedNotes.forEach(note => io.to(`user_${note.userId}`).emit("notification:new", note));
      }
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ message: "Failed to approve task" });
  }
};

// Disapprove Task
const disapproveTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { comment, adminName } = req.body;

    const task = await Task.findById(id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    //Unapprove and move back to In Progress
    task.isApproved = false;
    task.approvedAt = null;
    task.status = "In Progress";

    // Add Rejection Comment
    task.comments.push({
      userId: req.auth.userId,
      userName: adminName || "Admin",
      text: comment || "Task Disapproved.",
      type: "REJECTION"
    });

    await task.save();

    const io = req.app.get("io");
    if (io) io.to(`project_${task.projectId}`).emit("task:updated", task);

    // Notify Assignees
    const notifications = task.assignees.map(uid => ({
      userId: uid,
      message: `Task "${task.title}" DISAPPROVED. Please check comments.`,
      type: "INFO",
      projectId: task.projectId
    }));

    if (notifications.length > 0) {
      const savedNotes = await Notification.insertMany(notifications);
      if (io) {
        savedNotes.forEach(note => io.to(`user_${note.userId}`).emit("notification:new", note));
      }
    }

    res.json(task);
  } catch (error) {
    res.status(500).json({ message: "Failed to disapprove task" });
  }
};

// Cron Job Logic 
const deleteExpiredTasks = async (io) => {
  try {
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

    // Find tasks that are approved and older than 15 days
    const tasksToDelete = await Task.find({
      isApproved: true,
      approvedAt: { $lte: fifteenDaysAgo }
    });

    if (tasksToDelete.length === 0) return;

    console.log(`found ${tasksToDelete.length} tasks to auto-delete`);

    for (const task of tasksToDelete) {
        const filesToDelete = [];

        if (task.attachments && task.attachments.length > 0) {
            task.attachments.forEach(att => {
                if (att.url) filesToDelete.push(att.url);
            });
        }

        //Get files from Activity Logs (Uploads)
        const activities = await Activity.find({ taskId: task._id });
        activities.forEach(act => {
            if (act.type === 'UPLOAD' && act.metadata?.fileUrl) {
                filesToDelete.push(act.metadata.fileUrl);
            }
        });

        //Delete from Supabase
        if (filesToDelete.length > 0) {
            console.log(`🗑️ Auto-deleting ${filesToDelete.length} files for task ${task.title}...`);
            await Promise.all(filesToDelete.map(url => deleteFileFromUrl(url)));
        }

        // Delete Activity Logs
        await Activity.deleteMany({ taskId: task._id });

        // Notify Admin
        const project = await Project.findById(task.projectId);
        if (project && project.ownerId) {
             const note = await Notification.create({
                userId: project.ownerId,
                message: `Task "${task.title}" was auto-deleted (15 days post-approval).`,
                type: "INFO",
                projectId: task.projectId
             });
             if(io) io.to(`user_${project.ownerId}`).emit("notification:new", note);
        }

        // Notify Room 
        if(io) io.to(`project_${task.projectId}`).emit("task:deleted", task._id);
        
        // Finally, delete the task document
        await task.deleteOne();
    }
    
    console.log(`🧹 Auto-deleted ${tasksToDelete.length} approved tasks and their files.`);

  } catch (error) {
    console.error("Auto-delete error:", error);
  }
};

const addTaskActivity = async (req, res) => {
    try {
        const { id } = req.params; // Task ID
        const { type, content, metadata } = req.body; // type: 'COMMENT' or 'UPLOAD'
        const userId = req.auth.userId;

        const task = await Task.findById(id);
        if (!task) return res.status(404).json({ message: "Task not found" });

        const user = await User.findOne({ clerkId: userId });

        //Create Activity
        const activity = await Activity.create({
            taskId: id,
            userId,
            userName: user ? `${user.firstName} ${user.lastName}` : "User",
            userPhoto: user?.photo,
            type,
            content,
            metadata
        });

        //If it's an upload, ALSO push to Task attachments for gallery view
        if (type === 'UPLOAD' && metadata?.fileUrl) {
            task.attachments.push({
                name: metadata.fileName,
                url: metadata.fileUrl,
                type: metadata.fileType || 'IMAGE'
            });
            await task.save();
        }

        // Emit Socket Event
        const io = req.app.get("io");
        if (io) {
            io.to(`project_${task.projectId}`).emit("task:activity", activity);
            if (type === 'UPLOAD') {
                io.to(`project_${task.projectId}`).emit("task:updated", task);
            }
        }

        res.status(201).json(activity);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to add activity" });
    }
};

// Get Activities for a Task
const getTaskActivities = async (req, res) => {
    try {
        const { id } = req.params;
        const activities = await Activity.find({ taskId: id }).sort({ createdAt: -1 }).lean();
        res.json(activities);
    } catch (error) {
        res.status(500).json({ message: "Failed to load history" });
    }
};

export {
  getTasks,
  createTask,
  deleteTask,
  getUserTasks,
  getTaskById,
  updateTask,
  inviteToTask,
  respondToTaskInvite,
  approveTask,
  disapproveTask,
  deleteExpiredTasks,
  addTaskActivity,
  getTaskActivities
};