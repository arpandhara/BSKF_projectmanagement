import React, { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { useUser, useAuth } from "@clerk/clerk-react";
import NewTaskModal from "../../components/specific/NewTaskModal";
import api from "../../services/api";
import { getSocket } from "../../services/socket";
import ProjectEvents from "./ProjectEvents";
import PageTransition from "../../components/common/PageTransition";

const ProjectDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const { orgRole } = useAuth();

  const [project, setProject] = useState(null);
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");

  const [activeTab, setActiveTab] = useState("tasks");

  // Filter State
  const [filters, setFilters] = useState({
    status: "All",
    type: "All",
    priority: "All",
    assignee: "All",
  });

  const isAdmin =
    user?.publicMetadata?.role === "admin" || orgRole === "org:admin";

  // Initial Data Fetch
  const fetchData = async () => {
    try {
      const projRes = await api.get(`/projects/${id}`);
      setProject(projRes.data);
      const memRes = await api.get(`/projects/${id}/members`);
      setMembers(memRes.data);
      const tasksRes = await api.get(`/tasks/project/${id}`);
      setTasks(tasksRes.data);
    } catch (error) {
      console.error("Error fetching project data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  // SOCKET: Listen for Live Updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Join this project's room
    socket.emit("join_project", `project_${id}`);

    // Define handlers
    const handleTaskCreated = (newTask) => {
      if (!newTask || !newTask._id) return;
      setTasks((prev) => {
        if (prev.find((t) => t._id === newTask._id)) return prev;
        return [newTask, ...prev];
      });
    };

    const handleTaskUpdated = (updatedTask) => {
      setTasks((prev) =>
        prev.map((t) => (t._id === updatedTask._id ? updatedTask : t))
      );
    };

    const handleTaskDeleted = (deletedTaskId) => {
      setTasks((prev) => prev.filter((t) => t._id !== deletedTaskId));
    };

    const handleProjectMemberRemoved = (removedUserId) => {
      if (removedUserId === user.id) {
        alert("You have been removed from this project.");
        navigate("/projects");
      }
      setMembers((prev) => prev.filter((m) => m.clerkId !== removedUserId));
    };

    // Attach listeners
    socket.on("task:created", handleTaskCreated);
    socket.on("task:updated", handleTaskUpdated);
    socket.on("task:deleted", handleTaskDeleted);
    socket.on("project:member_removed", handleProjectMemberRemoved);

    // Cleanup: Leave room on unmount
    return () => {
      socket.emit("leave_project", `project_${id}`);
      socket.off("task:created", handleTaskCreated);
      socket.off("task:updated", handleTaskUpdated);
      socket.off("task:deleted", handleTaskDeleted);
      socket.off("project:member_removed", handleProjectMemberRemoved);
    };
  }, [id, user.id]);

  const handleAddMember = async (e) => {
    e.preventDefault();
    if (!newMemberEmail) return;
    try {
      const res = await api.put(`/projects/${id}/members`, {
        email: newMemberEmail,
      });
      if (res.data.member) {
        setMembers((prev) => [...prev, res.data.member]);
      }
      setNewMemberEmail("");
      alert("Member added successfully!");
    } catch (error) {
      alert(error.response?.data?.message || "Failed to add member");
    }
  };

  // Filter Logic
  const filteredTasks = tasks.filter((task) => {
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
          <ProjectStat label="Total Tasks" value={tasks.length} icon={Zap} />
          <ProjectStat
            label="Completed"
            value={tasks.filter((t) => t.status === "Done").length}
            icon={CheckCircle2}
            color="text-green-500"
          />
          <ProjectStat
            label="In Progress"
            value={tasks.filter((t) => t.status === "In Progress").length}
            icon={Clock}
            color="text-orange-500"
          />
          <ProjectStat
            label="Team Members"
            value={members.length}
            icon={User}
            color="text-blue-500"
          />
        </div>

        {/* Team Section */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Users size={18} /> Project Team
          </h2>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex -space-x-2 overflow-hidden">
              {members.map((mem) => (
                <img
                  key={mem._id || mem.clerkId}
                  src={mem.photo}
                  alt={mem.firstName}
                  title={`${mem.firstName} ${mem.lastName}`}
                  className="inline-block h-10 w-10 rounded-full ring-2 ring-neutral-900 bg-neutral-800 object-cover"
                />
              ))}
              {members.length === 0 && (
                <span className="text-sm text-neutral-500">No members yet</span>
              )}
            </div>

            {isAdmin && (
              <form onSubmit={handleAddMember} className="flex gap-2 ml-auto">
                <input
                  type="email"
                  placeholder="Add member by email..."
                  value={newMemberEmail}
                  onChange={(e) => setNewMemberEmail(e.target.value)}
                  className="bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white w-64 focus:outline-none focus:border-blue-600"
                />
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                >
                  <UserPlus size={16} /> Add
                </button>
              </form>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-neutral-800 flex gap-6 text-sm">
          <TabButton
            active={activeTab === "tasks"}
            onClick={() => setActiveTab("tasks")}
            icon={LayoutList}
            label="Tasks"
          />
          <TabButton
            active={activeTab === "calendar"}
            onClick={() => setActiveTab("calendar")}
            icon={CalendarIcon}
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
                        <span className="font-medium text-white">
                          {task.title}
                        </span>
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
                              const member = members.find(
                                (m) => m.clerkId === assigneeId
                              );
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
          onTaskCreated={() => {}}
        />
      </div>
    </PageTransition>
  );
};

// Helper Components
const ProjectStat = ({ label, value, icon: Icon, color = "text-white" }) => (
  <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex items-center justify-between">
    <div>
      <p className="text-neutral-400 text-xs mb-1">{label}</p>
      <h3 className="text-2xl font-bold">{value}</h3>
    </div>
    <Icon className={`${color} opacity-80`} size={20} />
  </div>
);

const TabButton = ({ icon: Icon, label, active, onClick }) => (
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
