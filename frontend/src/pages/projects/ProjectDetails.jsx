import React, { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  LayoutList,
  Calendar as CalendarIcon,
  Settings,
  User,
  Zap,
  CheckCircle2,
  Clock,
  Users,
  UserPlus,
  ChevronDown,
  X,
  MessageSquare,
} from "lucide-react";
import { useUser, useAuth, useOrganization } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import NewTaskModal from "../../components/specific/NewTaskModal";
import api from "../../services/api";
import { getSocket } from "../../services/socket";
import ProjectEvents from "./ProjectEvents";
import ProjectMembersModal from "../../components/specific/ProjectMembersModal";
import PageTransition from "../../components/common/PageTransition";

const ProjectDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const { orgRole } = useAuth();
  const queryClient = useQueryClient();

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);

  const { organization } = useOrganization();
  const [orgMembers, setOrgMembers] = useState([]);
  const [isFetchingOrgMembers, setIsFetchingOrgMembers] = useState(false);
  const [activeTab, setActiveTab] = useState("tasks");

  // Filter State
  const [filters, setFilters] = useState({
    status: "All",
    type: "All",
    priority: "All",
    assignee: "All",
  });

  const isAdmin = orgRole === "org:admin";

  // --- QUERIES ---

  // 1. Fetch Project
  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      const res = await api.get(`/projects/${id}`);
      return res.data;
    },
    staleTime: 1000 * 60 * 5,
  });

  // 2. Fetch Project Members
  const { data: members = [] } = useQuery({
    queryKey: ["project-members", id],
    queryFn: async () => {
      const res = await api.get(`/projects/${id}/members`);
      return res.data;
    },
    staleTime: 1000 * 60 * 10,
  });

  // 3. Fetch Tasks
  const { data: tasks = [] } = useQuery({
    queryKey: ["project-tasks", id],
    queryFn: async () => {
      const res = await api.get(`/tasks/project/${id}`);
      return res.data;
    },
    staleTime: 1000 * 60 * 2,
  });

  // Seed individual task cache
  useEffect(() => {
    if (tasks.length > 0) {
      tasks.forEach(task => {
        queryClient.setQueryData(["task", task._id], (old) => {
            if (old && new Date(old.updatedAt) > new Date(task.updatedAt)) return old;
            return task;
        });
      });
    }
  }, [tasks, queryClient]);

  const loading = loadingProject; // Main loading state

  // --- MUTATIONS ---

  // Toggle Member Mutation (Optimistic)
  const memberToggleMutation = useMutation({
    mutationFn: async (member) => {
      const clerkId = member.publicUserData.userId;
      const email = member.publicUserData.identifier;
      const isMember = members.some(m => m.clerkId === clerkId);

      if (isMember) {
        await api.delete(`/projects/${id}/members/${clerkId}`);
      } else {
        await api.put(`/projects/${id}/members`, { email });
      }
    },
    onMutate: async (member) => {
      await queryClient.cancelQueries(["project-members", id]);
      const previousMembers = queryClient.getQueryData(["project-members", id]);

      const clerkId = member.publicUserData.userId;
      const isMember = previousMembers?.some(m => m.clerkId === clerkId);

      queryClient.setQueryData(["project-members", id], (old) => {
         if (isMember) {
           return old.filter(m => m.clerkId !== clerkId);
         } else {
           const newMember = {
            _id: `temp_${Date.now()}`,
            clerkId: clerkId,
            firstName: member.publicUserData.firstName,
            lastName: member.publicUserData.lastName,
            email: member.publicUserData.identifier,
            photo: member.publicUserData.imageUrl
          };
          return [...(old || []), newMember];
         }
      });
      
      return { previousMembers };
    },
    onError: (err, vars, context) => {
       queryClient.setQueryData(["project-members", id], context.previousMembers);
       alert("Failed to update member.");
    },
    onSettled: () => {
       queryClient.invalidateQueries(["project-members", id]);
    }
  });

  const handleMemberToggle = (member) => {
    memberToggleMutation.mutate(member);
  };

  // Cache Organization Members (Fetch only once)
  const fetchOrgMembers = async () => {
    if (orgMembers.length > 0 || !organization) return;
    
    setIsFetchingOrgMembers(true);
    try {
      const res = await organization.getMemberships({ pageSize: 100 });
      setOrgMembers(res.data);
    } catch (error) {
      console.error("Failed to load organization members", error);
    } finally {
      setIsFetchingOrgMembers(false);
    }
  };

  const handleOpenMemberModal = () => {
    setIsMemberModalOpen(true);
    fetchOrgMembers();
  };

  // SOCKET: Listen for Live Updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !project) return;

    socket.emit("join_project", `project_${id}`);
    if (project.orgId) {
      socket.emit("join_org", project.orgId);
    }

    // Task Listeners
    const handleTaskCreated = (newTask) => {
      queryClient.setQueryData(["project-tasks", id], (old) => {
         if (!old) return [newTask];
         if (old.find(t => t._id === newTask._id)) return old;
         return [newTask, ...old];
      });
    };

    const handleTaskUpdated = (updatedTask) => {
       queryClient.setQueryData(["project-tasks", id], (old) => 
          old ? old.map(t => t._id === updatedTask._id ? updatedTask : t) : []
       );
    };

    const handleTaskDeleted = (deletedTaskId) => {
       queryClient.setQueryData(["project-tasks", id], (old) => 
          old ? old.filter(t => t._id !== deletedTaskId) : []
       );
    };

    // New Activity (Chat) Listener
    const handleTaskActivity = (activity) => {
        // If I sent it, I've read it. If someone else sent it, it's unread.
        if (activity.userId === user.id) return;

        queryClient.setQueryData(["project-tasks", id], (oldTasks) => {
            if (!oldTasks) return oldTasks;
            return oldTasks.map(t => {
                if (t._id === activity.taskId) {
                    return { ...t, hasUnread: true };
                }
                return t;
            });
        });
    };

    // Member Listeners
    const handleProjectMemberRemoved = (removedUserId) => {
      if (removedUserId === user.id) {
        alert("You have been removed from this project.");
        navigate("/projects");
      }
      queryClient.setQueryData(["project-members", id], (old) => 
         old ? old.filter(m => m.clerkId !== removedUserId) : []
      );
    };

    const handleTeamUpdate = () => {
       queryClient.invalidateQueries(["project-members", id]);
    };

    socket.on("task:updated", handleTaskUpdated);
    socket.on("task:deleted", handleTaskDeleted);
    socket.on("task:activity", handleTaskActivity); // 👈 Add listener
    socket.on("project:member_removed", handleProjectMemberRemoved);
    socket.on("team:update", handleTeamUpdate);

    return () => {
      socket.emit("leave_project", `project_${id}`);
      socket.off("task:created", handleTaskCreated);
      socket.off("task:updated", handleTaskUpdated);
      socket.off("task:deleted", handleTaskDeleted);
      socket.off("task:activity", handleTaskActivity); // 👈 Remove listener
      socket.off("project:member_removed", handleProjectMemberRemoved);
      socket.off("team:update", handleTeamUpdate);
    };
  }, [id, user.id, project, queryClient]);

  // NEW: Remove member from project (admin only)
  // NEW: Remove member from project (admin only)
  // Logic moved to ProjectMembersModal
  
  // Logic for adding member moved to ProjectMembersModal

  // Memoize member lookup for O(1) access
  const memberMap = useMemo(() => {
    return members.reduce((acc, mem) => {
      acc[mem.clerkId] = mem;
      return acc;
    }, {});
  }, [members]);

  // Filter Logic
  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchStatus =
        filters.status === "All" || task.status === filters.status;
      const matchType = filters.type === "All" || task.type === filters.type;
      const matchPriority =
        filters.priority === "All" || task.priority === filters.priority;
      const matchAssignee =
        filters.assignee === "All" ||
        (task.assignees && task.assignees.includes(filters.assignee));
      return matchStatus && matchType && matchPriority && matchAssignee;
    });
  }, [tasks, filters]);

  // Filter Options
  const statusOptions = ["All", "To Do", "In Progress", "Done"];
  const priorityOptions = ["All", "HIGH", "MEDIUM", "LOW"];
  const typeOptions = [
    "All",
    "TASK",
    "BUG",
    "IMPROVEMENT",
    "DESIGN",
    "CONTENT_WRITING",
    "SOCIAL_MEDIA",
    "OTHER",
  ];

  const assigneeOptions = [
    { label: "All Assignees", value: "All" },
    ...members.map((m) => ({
      label: `${m.firstName} ${m.lastName}`,
      value: m.clerkId,
    })),
  ];

  if (loading)
    return (
      <div className="p-8 text-neutral-400">Loading project details...</div>
    );
  if (!project)
    return <div className="p-8 text-neutral-400">Project not found</div>;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header & Actions */}
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/projects")}
              className="text-neutral-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold">{project.title}</h1>
                <span className="bg-green-500/20 text-green-400 text-xs px-2 py-0.5 rounded font-medium">
                  {project.status || "ACTIVE"}
                </span>
              </div>
            </div>
          </div>

          {isAdmin && activeTab === "tasks" && (
            <button
              onClick={() => setIsTaskModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
            >
              <Plus size={16} /> New Task
            </button>
          )}
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ProjectStat label="Total Tasks" value={tasks.length} Icon={Zap} />
          <ProjectStat
            label="Completed"
            value={tasks.filter((t) => t.status === "Done").length}
            Icon={CheckCircle2}
            color="text-green-500"
          />
          <ProjectStat
            label="In Progress"
            value={tasks.filter((t) => t.status === "In Progress").length}
            Icon={Clock}
            color="text-orange-500"
          />
          <ProjectStat
            label="Team Members"
            value={members.length}
            Icon={User}
            color="text-blue-500"
          />
        </div>

        {/* Team Section */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Users size={18} /> Project Team
            </h2>
            {isAdmin && (
              <button
                onClick={handleOpenMemberModal}
                className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-neutral-700"
              >
                <Users size={14} /> Manage Team
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex -space-x-2 overflow-hidden">
              {members.map((mem) => (
                <div key={mem._id || mem.clerkId} className="relative group">
                  <img
                    src={mem.photo}
                    alt={mem.firstName}
                    title={`${mem.firstName} ${mem.lastName}`}
                    className="inline-block h-10 w-10 rounded-full ring-2 ring-neutral-900 bg-neutral-800 object-cover"
                  />
                </div>
              ))}
              {members.length === 0 && (
                <span className="text-sm text-neutral-500">No members yet</span>
              )}
            </div>
          </div>
        </div>

        <ProjectMembersModal
          isOpen={isMemberModalOpen}
          onClose={() => setIsMemberModalOpen(false)}
          projectId={id}
          currentMembers={members}
          orgMembers={orgMembers}
          loadingOrgMembers={isFetchingOrgMembers}
          onMemberToggled={handleMemberToggle}
        />

        {/* Tabs */}
        <div className="border-b border-neutral-800 flex gap-6 text-sm">
          <TabButton
            active={activeTab === "tasks"}
            onClick={() => setActiveTab("tasks")}
            Icon={LayoutList}
            label="Tasks"
          />
          <TabButton
            active={activeTab === "calendar"}
            onClick={() => setActiveTab("calendar")}
            Icon={CalendarIcon}
            label="Calendar"
          />

          {/* Settings Button: Removed isAdmin check so it always appears */}
          <button
            onClick={() => navigate(`/projects/${id}/settings`)}
            className="flex items-center gap-2 pb-3 border-b-2 border-transparent text-neutral-400 hover:text-white ml-auto transition-colors"
          >
            <Settings size={16} /> Settings
          </button>
        </div>

        {/* Conditional Content Rendering */}
        {activeTab === "tasks" ? (
          <>
            {/* Filter Row */}
            <div className="flex flex-wrap gap-3 py-2">
              <FilterDropdown
                label="Status"
                options={statusOptions}
                value={filters.status}
                onChange={(val) => setFilters({ ...filters, status: val })}
              />
              <FilterDropdown
                label="Type"
                options={typeOptions}
                value={filters.type}
                onChange={(val) => setFilters({ ...filters, type: val })}
              />
              <FilterDropdown
                label="Priority"
                options={priorityOptions}
                value={filters.priority}
                onChange={(val) => setFilters({ ...filters, priority: val })}
              />
              <FilterDropdown
                label="Assignee"
                options={assigneeOptions}
                value={filters.assignee}
                onChange={(val) => setFilters({ ...filters, assignee: val })}
                isObjectOptions={true}
              />

              {(filters.status !== "All" ||
                filters.type !== "All" ||
                filters.priority !== "All" ||
                filters.assignee !== "All") && (
                <button
                  onClick={() =>
                    setFilters({
                      status: "All",
                      type: "All",
                      priority: "All",
                      assignee: "All",
                    })
                  }
                  className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors px-2"
                >
                  <X size={14} /> Clear
                </button>
              )}
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
              <div className="grid grid-cols-12 gap-4 p-4 border-b border-neutral-800 text-xs font-bold text-neutral-500 uppercase tracking-wider">
                <div className="col-span-5">Title</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-1">Priority</div>
                <div className="col-span-1">Status</div>
                <div className="col-span-2">Assignee</div>
                <div className="col-span-1 text-right">Due Date</div>
              </div>

              <div>
                {filteredTasks.length > 0 ? (
                  filteredTasks.map((task) => (
                    <div
                      key={task._id}
                      onClick={() => navigate(`/tasks/${task._id}`)}
                      className="grid grid-cols-12 gap-4 p-4 border-b border-neutral-800/50 hover:bg-neutral-800/50 transition-colors items-center text-sm last:border-0 cursor-pointer"
                    >
                      {/* Title & Color Dot */}
                      <div className="col-span-5 flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            task.type === "OTHER"
                              ? "bg-orange-400"
                              : "bg-green-400"
                          }`}
                        ></div>
                        <span className="font-medium text-white truncate">
                          {task.title}
                        </span>
                        {/* Chat Indicator */}
                         <div className="relative flex items-center justify-center w-6 h-6 shrink-0 group/chat">
                            <MessageSquare 
                               size={14} 
                               className={`transition-colors ${task.hasUnread ? "text-white" : "text-neutral-600 group-hover/chat:text-neutral-400"}`} 
                            />
                            {task.hasUnread && (
                               <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-[#0b141a]"></span>
                            )}
                         </div>
                      </div>

                      {/* Type Badge */}
                      <div className="col-span-2">
                        <span className="flex items-center gap-1.5 text-xs font-medium uppercase text-neutral-400 border border-neutral-800 bg-neutral-800/50 px-2 py-0.5 rounded w-fit">
                          <LayoutList size={12} />
                          {task.type ? task.type.replace("_", " ") : "TASK"}
                        </span>
                      </div>

                      {/* Priority */}
                      <div className="col-span-1">
                        <span
                          className={`text-xs font-bold px-2 py-1 rounded ${
                            task.priority === "HIGH"
                              ? "bg-green-500/20 text-green-400"
                              : "bg-blue-500/20 text-blue-400"
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>

                      {/* Status */}
                      <div className="col-span-1 text-neutral-300">
                        {task.status}
                      </div>

                      {/* Multiple Assignees Rendering */}
                      <div className="col-span-2 flex items-center gap-1">
                        {task.assignees && task.assignees.length > 0 ? (
                          <div className="flex -space-x-2 overflow-hidden">
                            {task.assignees.map((assigneeId) => {
                              const member = memberMap[assigneeId];
                              if (!member) return null;
                              return (
                                <img
                                  key={assigneeId}
                                  src={member.photo}
                                  className="inline-block h-6 w-6 rounded-full ring-2 ring-neutral-900 bg-neutral-800 object-cover"
                                  alt={member.firstName}
                                  title={`${member.firstName} ${member.lastName}`}
                                />
                              );
                            })}
                          </div>
                        ) : (
                          <span className="text-neutral-500 text-xs">
                            Unassigned
                          </span>
                        )}
                      </div>

                      {/* Due Date */}
                      <div className="col-span-1 text-right text-neutral-400 text-xs">
                        {task.dueDate
                          ? new Date(task.dueDate).toLocaleDateString()
                          : "-"}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-neutral-500">
                    No tasks found matching filters.
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* Calendar / Events View */
          <ProjectEvents />
        )}

        <NewTaskModal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          projectId={id}
          projectMembers={members}
          onTaskCreated={() => {
             // Invalidate to be safe, though socket also updates
             queryClient.invalidateQueries(["project-tasks", id]);
          }}
        />
      </div>
    </PageTransition>
  );
};

// Helper Components
// eslint-disable-next-line no-unused-vars
const ProjectStat = ({ label, value, Icon, color = "text-white" }) => (
  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex items-center justify-between">
    <div>
      <p className="text-neutral-400 text-xs mb-1">{label}</p>
      <h3 className="text-2xl font-bold">{value}</h3>
    </div>
    <Icon className={`${color} opacity-80`} size={20} />
  </div>
);

// eslint-disable-next-line no-unused-vars
const TabButton = ({ Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-2 pb-3 border-b-2 transition-colors ${
      active
        ? "border-blue-600 text-white"
        : "border-transparent text-neutral-400 hover:text-neutral-200"
    }`}
  >
    <Icon size={16} />
    {label}
  </button>
);

const FilterDropdown = ({
  label,
  options,
  value,
  onChange,
  isObjectOptions = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getLabel = () => {
    if (value === "All") return `All ${label}s`;
    if (isObjectOptions) {
      return options.find((o) => o.value === value)?.label || value;
    }
    return value.replace("_", " ");
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-2 transition-colors border ${
          value !== "All"
            ? "bg-blue-600/10 border-blue-600/50 text-blue-400"
            : "bg-neutral-900 border-neutral-800 hover:bg-neutral-800 text-neutral-300"
        }`}
      >
        {getLabel()}{" "}
        <ChevronDown
          size={14}
          className={value !== "All" ? "text-blue-400" : "text-neutral-500"}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 w-48 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-20 overflow-hidden">
          {options.map((option) => {
            const optValue = isObjectOptions ? option.value : option;
            const optLabel = isObjectOptions
              ? option.label
              : option.replace("_", " ");

            return (
              <button
                key={optValue}
                onClick={() => {
                  onChange(optValue);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-800 transition-colors ${
                  value === optValue
                    ? "text-blue-400 bg-blue-600/5"
                    : "text-neutral-300"
                }`}
              >
                {optLabel}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ProjectDetails;
