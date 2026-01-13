import express from "express";
import validate from "../middleware/zodValidationMiddleWare.js";
import createProjectSchema from "../schemas/projectSchema.js";
import {
  getProjects,
  getProjectById,
  createProject,
  deleteProject,
  addProjectMember,
  getProjectMembers,
  updateProjectSettings,
  removeProjectMember,
  createProjectEvent,
  getProjectEvents
} from "../controllers/projectController.js";
import { requireAuth, requireRole } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public/Viewer Routes
router.get("/", requireAuth, getProjects);
router.get("/:id", requireAuth, getProjectById);

// Admin Routes
router.post(
  "/",
  requireAuth,
  requireRole(["admin"]),
  validate(createProjectSchema),
  createProject
);

router.delete("/:id", requireAuth, requireRole(["admin"]), deleteProject);

router.get('/:id/members', requireAuth, getProjectMembers);
router.put('/:id/members', requireAuth, addProjectMember);

router.put('/:id', updateProjectSettings);
router.delete("/:id/members", requireAuth, requireRole(["admin", "org:admin"]), removeProjectMember);
router.post("/:id/events", requireAuth, createProjectEvent);
router.get("/:id/events", requireAuth, getProjectEvents);

export default router;
