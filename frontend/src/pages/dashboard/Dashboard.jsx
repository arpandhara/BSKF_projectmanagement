import React, { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Folder, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { useAuth, useUser } from "@clerk/clerk-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSocket } from "../../services/socket";
import PageTransition from "../../components/common/PageTransition";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { orgId } = useAuth();

  const queryClient = useQueryClient();

  const [userStatus, setUserStatus] = useState("active");
  const [statusLoading, setStatusLoading] = useState(false);

  const containerRef = useRef(null);

  // --- QUERIES ---

  // 1. Fetch Request: Projects (Shared Cache with ProjectList)
  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ["projects", orgId],
    queryFn: async () => {
      const response = await api.get("/projects", {
        params: { orgId: orgId || "" },
      });
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: !!orgId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // 2. Fetch Request: My Tasks
  const { data: myTasks = [], isLoading: loadingTasks } = useQuery({
    queryKey: ["my-tasks", user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const res = await api.get(`/tasks/user/${user.id}`);
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
  });

  // Seed individual task cache from Dashboard
  useEffect(() => {
    if (myTasks.length > 0) {
      myTasks.forEach(task => {
        queryClient.setQueryData(["task", task._id], (old) => {
           if (old && new Date(old.updatedAt) > new Date(task.updatedAt)) return old;
           return task;
        });
      });
    }
  }, [myTasks, queryClient]);

  const loading = loadingProjects || loadingTasks;

  useGSAP(
    () => {
      if (!containerRef.current) return;
      const tl = gsap.timeline({ delay: 0.2 });
      tl.from(".stat-card", {
        y: 30,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1,
        ease: "back.out(1.7)",
        clearProps: "all"
      });
      tl.from(".dashboard-section", {
        x: -15,
        opacity: 0,
        duration: 0.5,
        stagger: 0.15,
        ease: "power2.out",
        clearProps: "all"
      }, "-=0.2");
    },
    { 
      scope: containerRef, 
      dependencies: [orgId] 
    }
  );

  useEffect(() => {
    if (!orgId) {
      navigate("/settings");
    }
  }, [orgId, navigate]);

  const fetchUserStatus = React.useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get(`/users/${user.id}/status`);
      setUserStatus(res.data.status);
    } catch (error) {
      console.error("Failed to fetch user status", error);
    }
  }, [user?.id]);

  const handleStatusToggle = async () => {
    const oldStatus = userStatus;
    const newStatus = userStatus === "active" ? "on_leave" : "active";
    setUserStatus(newStatus);
    setStatusLoading(true);
    try {
      await api.put("/users/status", { 
        status: newStatus,
        orgId: orgId
      });
    } catch (error) {
      console.error("Failed to update status", error);
      setUserStatus(oldStatus);
      alert("Failed to update status. Please try again.");
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    if (!orgId) return;
    fetchUserStatus();

    const socket = getSocket();

    const handleUpdate = () => {
      console.log("⚡ Dashboard refreshing data...");
      queryClient.invalidateQueries(["projects", orgId]);
      queryClient.invalidateQueries(["my-tasks", user?.id]);
    };

    if (socket) {
      socket.on("notification:new", handleUpdate);
      socket.on("dashboard:update", handleUpdate);
      socket.on("project:deleted", handleUpdate);
      socket.on("task:assigned", handleUpdate);

      // Instant Chat Update
      socket.on("task:activity", (activity) => {
         if (activity.userId === user.id) return;
         
         // Optimistically update My Tasks
         queryClient.setQueryData(["my-tasks", user?.id], (oldTasks) => {
            if (!oldTasks) return oldTasks;
            return oldTasks.map(t => {
               if (t._id === activity.taskId) {
                  return { ...t, hasUnread: true };
               }
               return t;
            });
         });
      });
    }

    return () => {
      if (socket) {
        socket.off("notification:new", handleUpdate);
        socket.off("dashboard:update", handleUpdate);
        socket.off("project:deleted", handleUpdate);
        socket.off("task:assigned", handleUpdate);
      }
    };
  }, [orgId, user?.id, queryClient, fetchUserStatus]);

  if (!orgId) return null; // Prevent flash of content before redirect

  // Calculate Stats
  const completedProjects = projects.filter(
    (p) => p.status === "COMPLETED"
  ).length;

  const overdueTasks = myTasks.filter((t) => {
    if (!t.dueDate || t.status === "Done") return false;
    return new Date(t.dueDate) < new Date();
  });

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">
              Welcome back, {user?.firstName}
            </h1>
            <p className="text-neutral-400 mt-1">
              Here's what's happening with your projects today.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Availability Status Toggle */}
            <div className="flex items-center gap-3 bg-neutral-900 border border-neutral-800 px-4 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${userStatus === "active" ? "bg-green-500" : "bg-red-500"}`}></div>
                <span className="text-sm font-medium">
                  {userStatus === "active" ? "Active" : "On Leave"}
                </span>
              </div>
              <button
                onClick={handleStatusToggle}
                disabled={statusLoading}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  userStatus === "active" ? "bg-green-600" : "bg-red-600"
                } ${statusLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                title={`Currently ${userStatus === "active" ? "Active" : "On Leave"}. Click to toggle.`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                    userStatus === "active" ? "translate-x-0" : "translate-x-5"
                  }`}
                ></span>
              </button>
            </div>

            {/* Profile Photo - Clickable */}
            <button
              onClick={() => navigate("/settings")}
              className="relative group"
              title="My Profile"
            >
              <img
                src={user?.imageUrl}
                alt={user?.firstName || "Profile"}
                className="w-10 h-10 rounded-full border-2 border-neutral-700 hover:border-blue-500 transition-colors cursor-pointer object-cover"
              />
              {/* Tooltip on hover */}
              <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-neutral-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                My Profile
              </span>
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="stat-card">
            <StatCard
              label="Total Projects"
              value={projects.length}
              sub="projects in Cloud Ops"
              Icon={Folder}
              color="bg-blue-500/10 text-blue-500"
            />
          </div>
          <div className="stat-card">
            <StatCard
              label="Completed"
              value={completedProjects}
              sub="of total projects"
              Icon={CheckCircle}
              color="bg-green-500/10 text-green-500"
            />
          </div>
          <div className="stat-card">
            <StatCard
              label="My Tasks"
              value={myTasks.length}
              sub="assigned to me"
              Icon={Clock}
              color="bg-purple-500/10 text-purple-500"
            />
          </div>
          <div className="stat-card">
            <StatCard
              label="Overdue"
              value={overdueTasks.length}
              sub="needs attention"
              Icon={AlertTriangle}
              color="bg-orange-500/10 text-orange-500"
            />
          </div>
        </div>

        {/* Main Content Split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Project Overview */}
          <div className="lg:col-span-2 space-y-6 dashboard-section">
            <div className="flex justify-between items-end">
              <h2 className="text-lg font-semibold">Project Overview</h2>
              <button
                onClick={() => navigate("/projects")}
                className="text-xs text-neutral-400 hover:text-white"
              >
                View all →
              </button>
            </div>

            <div className="space-y-4">
              {loading ? (
                <div className="text-neutral-500 text-sm">
                  Loading projects...
                </div>
              ) : projects.length > 0 ? (
                projects.slice(0, 3).map((project) => (
                  <div
                    key={project._id || project.id}
                    onClick={() =>
                      navigate(`/projects/${project._id || project.id}`)
                    }
                    className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 hover:border-neutral-700 transition-colors cursor-pointer group"
                  >
                    <div className="flex justify-between mb-2">
                      <h3 className="font-semibold text-lg text-white group-hover:text-blue-400 transition-colors">
                        {project.title}
                      </h3>
                      <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded font-medium">
                        {project.status || "ACTIVE"}
                      </span>
                    </div>

                    <p className="text-neutral-400 text-sm mb-4 line-clamp-2">
                      {project.description}
                    </p>

                    <div className="flex items-center justify-between text-xs text-neutral-500 mt-4">
                      <div className="flex items-center gap-3">
                        <span
                          className={`font-bold ${
                            project.priority === "HIGH"
                              ? "text-orange-400"
                              : "text-neutral-400"
                          }`}
                        >
                          {project.priority || "MEDIUM"}
                        </span>
                        <span>
                          • Created{" "}
                          {new Date(project.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-neutral-800 h-1.5 rounded-full mt-3">
                      <div className="bg-blue-500 h-1.5 rounded-full w-[25%]"></div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center bg-neutral-900 border border-neutral-800 rounded-xl text-neutral-500">
                  No projects yet. Create one to get started!
                </div>
              )}
            </div>
          </div>

          {/* Right: My Tasks & Overdue */}
          <div className="space-y-6 dashboard-section">
            {/* My Tasks Widget */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-sm">My Tasks</h3>
                <span className="bg-blue-500/20 text-blue-400 text-xs px-1.5 py-0.5 rounded">
                  {myTasks.length}
                </span>
              </div>

              <div className="space-y-3">
                {myTasks.length > 0 ? (
                  myTasks.slice(0, 5).map((task) => (
                    <div
                      key={task._id}
                      onClick={() => navigate(`/tasks/${task._id}`)}
                    >
                      <TaskItem
                        title={task.title}
                        priority={task.priority}
                        type={task.type}
                        status={task.status}
                        hasUnread={task.hasUnread}
                      />
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-neutral-500 text-center py-2">
                    No tasks assigned.
                  </p>
                )}
              </div>
            </div>

            {/* Overdue Widget */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-semibold text-sm">Overdue</h3>
                <span className="bg-red-500/20 text-red-400 text-xs px-1.5 py-0.5 rounded">
                  {overdueTasks.length}
                </span>
              </div>
              <div className="space-y-3">
                {overdueTasks.length > 0 ? (
                  overdueTasks.slice(0, 3).map((task) => (
                    <div
                      key={task._id}
                      className="text-xs text-red-400 border border-red-900/30 bg-red-900/10 p-2 rounded flex justify-between"
                    >
                      <span className="truncate">{task.title}</span>
                      <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-neutral-500 text-center py-2 opacity-60">
                    No overdue tasks
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

// Reusable Components
// eslint-disable-next-line no-unused-vars
const StatCard = ({ label, value, sub, Icon, color }) => (
  <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl">
    <div className="flex justify-between items-start">
      <div>
        <p className="text-neutral-400 text-sm">{label}</p>
        <h2 className="text-3xl font-bold mt-2">{value}</h2>
        <p className="text-xs text-neutral-500 mt-1">{sub}</p>
      </div>
      <div className={`p-3 rounded-lg ${color}`}>
        <Icon size={20} />
      </div>
    </div>
  </div>
);

const TaskItem = ({ title, priority, type = "TASK", status, hasUnread }) => {
  const getPriorityColor = (p) => {
    if (p === "HIGH") return "text-orange-400";
    if (p === "MEDIUM") return "text-blue-400";
    return "text-neutral-400";
  };

  return (
    <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800 hover:border-neutral-700 cursor-pointer group">
      <div className="flex justify-between items-start mb-1">
        <h4 className="text-sm font-medium text-neutral-200 group-hover:text-white transition-colors truncate w-3/4">
          {title}
        </h4>
        {status === "Done" && (
          <CheckCircle size={14} className="text-green-500" />
        )}
        {hasUnread && status !== "Done" && (
           <div className="w-2 h-2 rounded-full bg-red-500 shrink-0 mt-1.5 animate-pulse"></div>
        )}
      </div>

      <div className="flex gap-2 text-[10px] uppercase tracking-wider font-bold items-center">
        <span className="text-neutral-500 bg-neutral-900 px-1.5 py-0.5 rounded">
          {type}
        </span>
        <span className={getPriorityColor(priority)}>{priority}</span>
      </div>
    </div>
  );
};

export default Dashboard;
