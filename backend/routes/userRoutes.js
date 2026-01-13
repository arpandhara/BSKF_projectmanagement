import express from 'express';
import { getUsers, updateUserRole, toggleAvailabilityStatus, getUserStatus } from '../controllers/userController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', requireAuth, getUsers);

router.put('/:id/role', requireAuth, requireRole(['admin']), updateUserRole);

// Availability Status Routes
router.put('/status', requireAuth, toggleAvailabilityStatus);
router.get('/:userId/status', requireAuth, getUserStatus);

export default router;