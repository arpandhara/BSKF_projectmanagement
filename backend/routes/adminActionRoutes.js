import express from "express";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";
import {
  requestDemotion,
  approveDemotion,
  getPendingRequests,
  promoteMember,
  requestOrgDeletion,
  approveOrgDeletion,
  rejectRequest,
} from "../controllers/adminActionController.js";

const router = express.Router();

const ALLOWED_ROLES = ["org:admin", "admin"];

router.post(
  "/demote/request",
  requireAuth,
  requireRole(ALLOWED_ROLES),
  requestDemotion
);
router.post(
  "/demote/approve/:requestId",
  requireAuth,
  requireRole(ALLOWED_ROLES),
  approveDemotion
);
router.get(
  "/pending",
  requireAuth,
  requireRole(ALLOWED_ROLES),
  getPendingRequests
);
router.post("/promote", requireAuth, requireRole(ALLOWED_ROLES), promoteMember);
router.post(
  "/delete-org/request",
  requireAuth,
  requireRole(ALLOWED_ROLES),
  requestOrgDeletion
);
router.post(
  "/delete-org/approve/:requestId",
  requireAuth,
  requireRole(ALLOWED_ROLES),
  approveOrgDeletion
);
router.post(
  "/reject/:requestId",
  requireAuth,
  requireRole(ALLOWED_ROLES),
  rejectRequest
);
export default router;
