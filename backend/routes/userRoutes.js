import express from 'express';
import { getUsers , updateUserRole } from '../controllers/userController.js';
import { requireAuth , requireRole } from '../middleware/authMiddleware.js';

const router = express.Router();

router.get('/', requireAuth, getUsers);

router.put('/:id/role', requireAuth, requireRole(['admin']), updateUserRole);

export default router;