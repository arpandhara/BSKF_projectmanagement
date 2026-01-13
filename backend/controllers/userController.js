import User from "../models/User.js";
import { createClerkClient } from '@clerk/clerk-sdk-node';

// @desc    Get all users (Team members)
// @route   GET /api/users
const getUsers = async (req, res) => {
  try {
    const users = await User.find().select("-clerkId").lean();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: "Server Error" });
  }
};

const clerkClient = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

// @desc    Change a user's role
// @route   PUT /api/users/:id/role
// @access  Admin Only
const updateUserRole = async (req, res) => {
  const { role } = req.body; // 'admin', 'member', or 'viewer'
  const { id } = req.params; // The MongoDB _id of the user to update

  try {
    // 1. Find user in MongoDB to get their Clerk ID
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 2. Update Clerk Metadata (This is what actually controls permission)
    await clerkClient.users.updateUserMetadata(user.clerkId, {
      publicMetadata: {
        role: role
      }
    });

    // 3. Update MongoDB (For display consistency)
    user.role = role;
    await user.save();

    res.json({ message: `User promoted to ${role}` });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update role" });
  }
};

export { getUsers , updateUserRole };