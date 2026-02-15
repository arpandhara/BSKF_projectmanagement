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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import NewProjectModal from "../../components/specific/NewProjectModal";
import api from "../../services/api";
import { getSocket } from "../../services/socket";
import PageTransition from "../../components/common/PageTransition";

const ProjectList = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { orgId, orgRole } = useAuth();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // Projects and Loading are now managed by React Query
  // const [projects, setProjects] = useState([]); 
  // const [loading, setLoading] = useState(true);

  // Track which dropdown is open (by project ID)
  const [openMenuId, setOpenMenuId] = useState(null);

  const containerRef = useRef(null);
  
  const isAdmin = orgRole === "org:admin";

  // 1. Fetch Projects (React Query)
  const { data: projects = [], isLoading: loading } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () => {
      const res = await api.get("/projects", { params: { orgId: orgId || "" } });
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: true, // Always try to fetch, backend handles auth
    staleTime: 1000 * 60 * 5, // 5 min stale
  });

  // Re-run animation whenever the 'projects' array changes
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
  }, { scope: containerRef, dependencies: [projects, searchTerm] }); // Re-animate on search too

  // Helper: Get Status Color
  const getStatusColor = (status) => {
    switch (status) {
      case "COMPLETED":
      case "DONE":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "ON_HOLD":
        return "bg-orange-500/20 text-orange-400 border-orange-500/30";
      case "ARCHIVED":
        return "bg-neutral-500/20 text-neutral-400 border-neutral-500/30";
      case "ACTIVE":
      default:
        return "bg-green-500/20 text-green-400 border-green-500/30";
    }
  };
  
  const getStatusBorder = (status) => {
     switch (status) {
      case "COMPLETED":
      case "DONE":
        return "border-l-4 border-l-blue-500";
      case "ON_HOLD":
        return "border-l-4 border-l-orange-500";
      case "ARCHIVED":
        return "border-l-4 border-l-neutral-500";
      case "ACTIVE":
      default:
        return "border-l-4 border-l-green-500";
    }
  };

  // Filter Projects
  const filteredProjects = projects.filter(p => 
    p.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 2. Delete Mutation (Optimistic)
  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId) => {
      await api.delete(`/projects/${projectId}`);
    },
    onMutate: async (projectId) => {
       // Stop refetches
       await queryClient.cancelQueries(["projects", orgId]);
       
       // Snapshot
       const previousProjects = queryClient.getQueryData(["projects", orgId]);

       // Optimistic Update
       queryClient.setQueryData(["projects", orgId], (old) => 
         old ? old.filter(p => (p._id || p.id) !== projectId) : []
       );

       // Close menu
       setOpenMenuId(null);
       
       return { previousProjects };
    },
    onError: (err, projectId, context) => {
      queryClient.setQueryData(["projects", orgId], context.previousProjects);
      alert("Failed to delete project");
    },
    onSettled: () => {
      queryClient.invalidateQueries(["projects", orgId]);
      window.dispatchEvent(new Event("projectUpdate")); // Keep legacy event if needed
    },
  });

  // Socket Logic (Cache Updates)
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    if (orgId) {
      socket.emit("join_org", orgId);
    }

    const handleProjectCreated = (newProject) => {
      const isOwner = newProject.ownerId === user?.id;
      const isMember = newProject.members?.includes(user?.id);

      if (isAdmin || isOwner || isMember) {
         queryClient.setQueryData(["projects", orgId], (old) => {
            if (!old) return [newProject];
            if (old.some(p => (p._id || p.id) === (newProject._id || newProject.id))) return old;
            return [newProject, ...old];
         });
      }
    };

    const handleProjectAssigned = (project) => {
       queryClient.setQueryData(["projects", orgId], (old) => {
          if (!old) return [project];
          if (old.some((p) => (p._id || p.id) === (project._id || project.id))) return old;
          return [project, ...old];
       });
    };

    const handleProjectRemovedOrDeleted = (projectId) => {
      queryClient.setQueryData(["projects", orgId], (old) => 
        old ? old.filter((p) => (p._id || p.id) !== projectId) : []
      );
    };

    socket.on("project:created", handleProjectCreated);
    socket.on("project:assigned", handleProjectAssigned);
    socket.on("project:removed_from", handleProjectRemovedOrDeleted);
    socket.on("project:deleted", handleProjectRemovedOrDeleted);

    return () => {
      socket.off("project:created", handleProjectCreated);
      socket.off("project:assigned", handleProjectAssigned);
      socket.off("project:removed_from", handleProjectRemovedOrDeleted);
      socket.off("project:deleted", handleProjectRemovedOrDeleted);
    };
  }, [orgId, isAdmin, user?.id, queryClient]);

  // Handle Delete
  const handleDelete = (e, projectId) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this project?")) return;
    deleteProjectMutation.mutate(projectId);
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="text-neutral-400 mt-1">
              Manage and track your projects
            </p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto">
             {/* Search Bar */}
             <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={16} />
                <input 
                  type="text" 
                  placeholder="Search projects..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 text-white text-sm rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-blue-500 transition-colors"
                />
             </div>

            {isAdmin && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors shrink-0"
              >
                <Plus size={16} /> <span className="hidden sm:inline">New Project</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredProjects.length > 0 ? (
            filteredProjects.map((project) => {
              const pid = project._id || project.id;
              const statusColorClass = getStatusColor(project.status || "ACTIVE");
              const statusBorderClass = getStatusBorder(project.status || "ACTIVE");

              return (
                <div
                  key={pid}
                  onClick={() => navigate(`/projects/${pid}`)}
                  className={`project-card bg-neutral-900 border border-neutral-800 rounded-xl p-4 sm:p-6 hover:border-neutral-700 transition-all cursor-pointer group relative overflow-hidden ${statusBorderClass}`}
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
                    <span className={`text-xs px-2 py-1 rounded font-medium border ${statusColorClass}`}>
                      {project.status ? project.status.replace("_", " ") : "ACTIVE"}
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
            <div className="col-span-2 text-center text-neutral-500 py-12 bg-neutral-900/50 rounded-xl border border-neutral-800 border-dashed">
              {searchTerm ? `No projects found matching "${searchTerm}"` : "No projects found."}
            </div>
          )}
        </div>

        <NewProjectModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          onProjectCreated={() => queryClient.invalidateQueries(["projects", orgId])}
        />
      </div>
    </PageTransition>
  );
};

export default ProjectList;
