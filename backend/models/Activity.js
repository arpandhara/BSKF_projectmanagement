import mongoose from "mongoose";

const activitySchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
  userId: { type: String, required: true }, // Clerk ID
  userName: { type: String }, // Store name snapshot for display
  userPhoto: { type: String }, // Store photo snapshot
  type: { 
    type: String, 
    enum: ['COMMENT', 'UPLOAD', 'STATUS_CHANGE', 'PRIORITY_CHANGE', 'ASSIGNMENT'], 
    required: true 
  },
  content: { type: String, required: true }, // "Changed status to Done" or "Here is the file"
  // Optional: Store file details if it's an upload
  metadata: {
    fileName: String,
    fileUrl: String,
    fileType: String
  }
}, { timestamps: true });

export default mongoose.model('Activity', activitySchema);