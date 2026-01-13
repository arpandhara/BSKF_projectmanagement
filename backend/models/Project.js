import mongoose from "mongoose";

const projectSchema = mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String , default: "No Description" },
    status: {
    type: String,
    enum: ["ACTIVE", "COMPLETED", "ON_HOLD", "ARCHIVED", "active", "completed"], 
    default: "ACTIVE"
  },
    priority: {
      type: String,
      enum: ["HIGH", "MEDIUM", "LOW"],
      default: "MEDIUM",
    },
    startDate: { type: Date },
    dueDate: { type: Date },

    ownerId: { type: String, required: true },
    orgId: { type: String },

    members: [{ type: String }],
  },
  {
    timestamps: true,
  }
);

projectSchema.index({ orgId: 1 });
projectSchema.index({ ownerId: 1 });
projectSchema.index({ members: 1 });

export default mongoose.model("Project", projectSchema);
