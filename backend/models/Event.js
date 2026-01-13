import mongoose from "mongoose";

const eventSchema = new mongoose.Schema({
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  title: { type: String, required: true },
  description: { type: String },
  meetLink: { type: String }, // Google Meet or Zoom URL
  startDate: { type: Date, required: true },
  createdBy: { type: String, required: true } // Clerk ID
}, { timestamps: true });

export default mongoose.model('Event', eventSchema);