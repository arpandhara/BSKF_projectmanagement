import mongoose from "mongoose";

const taskReadStatusSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // Clerk ID
    taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    lastReadAt: { type: Date, default: Date.now }
}, { timestamps: true });

// Compound index to quickly find a user's read status for a task
taskReadStatusSchema.index({ userId: 1, taskId: 1 }, { unique: true });

export default mongoose.model('TaskReadStatus', taskReadStatusSchema);
