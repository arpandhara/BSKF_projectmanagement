import mongoose from "mongoose";

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  status: { 
    type: String, 
    enum: ['To Do', 'In Progress', 'Done'], 
    default: 'To Do' 
  },
  priority: {
    type: String,
    enum: ['HIGH', 'MEDIUM', 'LOW'],
    default: 'MEDIUM'
  },
  type: {
    type: String,
    enum: ['TASK', 'BUG', 'IMPROVEMENT', 'DESIGN', 'CONTENT_WRITING', 'SOCIAL_MEDIA', 'OTHER'], 
    default: 'TASK'
  },
  dueDate: { type: Date },
  projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
  assignees: [{ type: String }],
  
  attachments: [{
    name: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String, enum: ['GITHUB', 'LINK', 'DOC' , 'IMAGE'], default: 'DOC' },
    uploadedAt: { type: Date, default: Date.now }
  }],

  isApproved: { type: Boolean, default: false },
  approvedAt: { type: Date },
  
  comments: [{
    userId: { type: String },
    userName: { type: String }, 
    text: { type: String },
    createdAt: { type: Date, default: Date.now }
  }]
}, {
  timestamps: true
});

taskSchema.index({ projectId: 1 }); 
taskSchema.index({ assignees: 1 }); 
taskSchema.index({ isApproved: 1, approvedAt: 1 });

export default mongoose.model('Task', taskSchema);