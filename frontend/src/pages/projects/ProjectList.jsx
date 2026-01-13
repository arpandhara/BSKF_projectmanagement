import React, { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import {
  Plus,
  Search,
  MoreVertical,
  Trash2,
  Calendar,
  User as UserIcon,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUser, useAuth } from "@clerk/clerk-react";
import NewProjectModal from "../../components/specific/NewProjectModal";
import api from "../../services/api";
import { getSocket } from "../../services/socket";
import PageTransition from "../../components/common/PageTransition";

const ProjectList = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const { orgId } = useAuth();

  // Track which dropdown is open (by project ID)
  const [openMenuId, setOpenMenuId] = useState(null);

  const containerRef = useRef(null);

  // Re-run animation whenever the 'projects' array changes (e.g. after loading)
  useGSAP(() => {
    if (projects.length > 0) {
      gsap.from(".project-card", {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.08, // Fast ripple effect
        ease: "power2.out",
        clearProps: "all" // Cleanup inline styles after animation
      });
    }
  }, { scope: containerRef, dependencies: [projects] });

  const isAdmin = user?.publicMetadata?.role === "admin";

  const fetchProjects = async () => {
    try {
      const response = await api.get("/projects", {
        params: { orgId: orgId || "" },
      });
      setProjects(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Failed to fetch projects", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, [orgId]);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleProjectDeleted = (deletedProjectId) => {
      setProjects((prev) =>
        prev.filter((p) => (p._id || p.id) !== deletedProjectId)
      );
    };

    socket.on("project:deleted", handleProjectDeleted);

    return () => {
      socket.off("project:deleted", handleProjectDeleted);
    };
  }, []);

  // Handle Delete
  const handleDelete = async (e, projectId) => {
    e.stopPropagation(); // Stop navigation to details
    if (!window.confirm("Are you sure you want to delete this project?"))
      return;

    try {
      await api.delete(`/projects/${projectId}`);

      window.dispatchEvent(new Event("projectUpdate"));

      setProjects(
        projects.filter((p) => p._id !== projectId && p.id !== projectId)
      );
      setOpenMenuId(null);
    } catch (error) {
      console.error("Failed to delete project", error);
      alert("Failed to delete project");
    }
  };

  // Toggle Dropdown
  const toggleMenu = (e, projectId) => {
    e.stopPropagation();
    setOpenMenuId(openMenuId === projectId ? null : projectId);
  };

  if (loading)
    return <div className="p-8 text-neutral-400">Loading projects...</div>;

  return (
    <PageTransition>
      <div ref={containerRef} className="space-y-6" onClick={() => setOpenMenuId(null)}>
        {/* Click anywhere to close menu */}

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="text-neutral-400 mt-1">
              Manage and track your projects
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
            >
              <Plus size={16} /> New Project
            </button>
          )}
        </div>

        {/* ... (Search bar section - keep as is) ... */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {projects.length > 0 ? (
            projects.map((project) => {
              const pid = project._id || project.id;
              return (
                <div
                  key={pid}
                  onClick={() => navigate(`/projects/${pid}`)}
                  className="project-card bg-neutral-900 border border-neutral-800 rounded-xl p-6 hover:border-neutral-700 transition-all cursor-pointer group relative"
                >
                  {/* Card Header */}
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-semibold text-lg text-white group-hover:text-blue-400 transition-colors">
                      {project.title}
                    </h3>

                    {/* Three Dots Menu - Only show for Admin */}
                    {isAdmin && (
                      <div className="relative">
                        <button
                          className="text-neutral-500 hover:text-white p-1 rounded-md hover:bg-neutral-800 transition-colors"
                          onClick={(e) => toggleMenu(e, pid)}
                        >
                          <MoreVertical size={18} />
                        </button>

                        {/* Dropdown */}
                        {openMenuId === pid && (
                          <div className="absolute right-0 top-full mt-2 w-40 bg-neutral-950 border border-neutral-800 rounded-lg shadow-xl z-10 overflow-hidden">
                            <button
                              onClick={(e) => handleDelete(e, pid)}
                              className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-neutral-900 transition-colors text-left"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="text-neutral-400 text-sm mb-6 line-clamp-2">
                    {project.description}
                  </p>

                  {/* Meta Info (Date & Creator) */}
                  <div className="flex items-center gap-4 mb-4 text-xs text-neutral-500 border-b border-neutral-800 pb-4">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={14} />
                      <span>
                        {new Date(project.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <UserIcon size={14} />
                      <span
                        className="truncate max-w-[100px]"
                        title={project.ownerId}
                      >
                        Admin{" "}
                        {/* Backend doesn't send name yet, using placeholder */}
                      </span>
                    </div>
                  </div>

                  {/* Status & Priority Tags */}
                  <div className="flex items-center justify-between">
                    <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded font-medium">
                      {project.status || "ACTIVE"}
                    </span>
                    <span
                      className={`text-xs font-bold uppercase ${
                        project.priority === "HIGH"
                          ? "text-orange-400"
                          : project.priority === "LOW"
                          ? "text-blue-400"
                          : "text-neutral-400"
                      }`}
                    >
                      {project.priority || "MEDIUM"} Priority
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="col-span-2 text-center text-neutral-500 py-12">
              No projects found.
            </div>
          )}
        </div>

        <NewProjectModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onProjectCreated={fetchProjects}
        />
      </div>
    </PageTransition>
  );
};

export default ProjectList;
