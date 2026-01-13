import mongoose from "mongoose";

const adminRequestSchema = new mongoose.Schema({
  targetUserId: { type: String}, // Who is being demoted
  requesterUserId: { type: String, required: true }, // Who asked for it
  orgId: { type: String, required: true },
  type: { type: String, enum: ['DEMOTE_ADMIN' , 'DELETE_ORG'], default: 'DEMOTE_ADMIN' },
  status: { type: String, enum: ['PENDING', 'APPROVED'], default: 'PENDING' }
}, { timestamps: true });

export default mongoose.model('AdminRequest', adminRequestSchema);