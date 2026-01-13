import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, default: 'INFO' }, // 'TASK_INVITE', 'INFO', etc.
  projectId: { type: String },
  read: { type: Boolean, default: false },
  
  // 👇 NEW: Store extra data like taskId for actionable notifications
  metadata: {
    taskId: String,
    senderId: String,
    role: String
  }
}, { timestamps: true });

export default mongoose.model("Notification", notificationSchema);