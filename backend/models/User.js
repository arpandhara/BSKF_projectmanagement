import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    clerkId: { 
      type: String, 
      required: true, 
      unique: true 
    },
    email: { 
      type: String, 
      required: true, 
      unique: true 
    },
    username: { 
      type: String 
    },
    photo: { 
      type: String 
    },
    firstName: { 
      type: String 
    },
    lastName: { 
      type: String 
    },
    role: {
      type: String,
      enum: ["admin", "member", "viewer"],
      default: "member", // Default role for new users
    },
  },
  { timestamps: true }
);

userSchema.index({ clerkId: 1 });

export default mongoose.model("User", userSchema);