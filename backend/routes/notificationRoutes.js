import express from 'express';
import Notification from '../models/Notification.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Get my notifications
router.get('/', requireAuth, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.auth.userId }).sort({ createdAt: -1 });
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: "Error fetching notifications" });
  }
});

// Dismiss (Delete)
router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const note = await Notification.findById(req.params.id);
    if (!note || note.userId !== req.auth.userId) {
      return res.status(403).json({ message: "Not authorized" });
    }
    await note.deleteOne();
    res.json({ message: "Dismissed" });
  } catch (error) {
    res.status(500).json({ message: "Error dismissing" });
  }
});

// 👇 NEW: Mark all as read
router.put('/mark-read', requireAuth, async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.auth.userId, read: false },
      { $set: { read: true } }
    );
    res.json({ message: "Marked as read" });
  } catch (error) {
    res.status(500).json({ message: "Error updating" });
  }
});

export default router;