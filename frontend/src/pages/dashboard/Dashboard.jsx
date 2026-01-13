import React, { useState, useEffect, useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Folder, CheckCircle, Clock, AlertTriangle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import { useAuth, useUser } from "@clerk/clerk-react";
import { getSocket } from "../../services/socket";
import PageTransition from "../../components/common/PageTransition";

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const { orgId } = useAuth();

  const [projects, setProjects] = useState([]);
  const [myTasks, setMyTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const containerRef = useRef(null);

  useGSAP(
    () => {
      // 1. Safety Check: If the component returned null (no orgId), stop here.
      if (!containerRef.current) return;

      // 2. Use a Timeline for sequencing
      const tl = gsap.timeline({ delay: 0.2 }); // Wait 0.2s for PageTransition to settle

      // Animate Stat Cards (Sequence)
      tl.from(".stat-card", {
        y: 30,
        opacity: 0,
        duration: 0.5,
        stagger: 0.1, // 0.1s delay between each card start
        ease: "back.out(1.7)", // Bounce effect
        clearProps: "all" // Cleanup after animation
      });

      // Animate Main Content Areas (Slide in after cards)
      tl.from(".dashboard-section", {
        x: -15,
        opacity: 0,
        duration: 0.5,
        stagger: 0.15,
        ease: "power2.out",
        clearProps: "all"
      }, "-=0.2"); // Overlap slightly (start 0.2s before cards finish)
    },
    { 
      scope: containerRef, 
      dependencies: [orgId] // 3. Re-run animation when orgId loads and view renders
    }
  );

  // Redirect to Settings if no Org selected (Personal Account)
  useEffect(() => {
    if (!orgId) {
      navigate("/settings");
    }
  }, [orgId, navigate]);

  const fetchProjects = async () => {
    try {
      const response = await api.get("/projects", {
        params: { orgId: orgId || "" },
      });
      setProjects(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error("Failed to load projects", error);
    }
  };

  const fetchMyTasks = async () => {
    if (!user?.id) return;
    try {
      const res = await api.get(`/tasks/user/${user.id}`);
      setMyTasks(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error("Failed to load tasks", error);
    }
  };

  useEffect(() => {
    if (!orgId) return; // Skip fetching if redirecting

    const initData = async () => {
      setLoading(true);
      await Promise.all([fetchProjects(), fetchMyTasks()]);
      setLoading(false);
    };

    initData();

    // 2. ⚡ SOCKET: Listen for updates
    const socket = getSocket();

    // Handler to refresh data
    const handleUpdate = () => {
      console.log("⚡ Dashboard refreshing due to socket event...");
      fetchMyTasks();
      fetchProjects();
    };

    // Legacy listeners (Keep for local updates)
    window.addEventListener("taskUpdate", fetchMyTasks);
    window.addEventListener("projectUpdate", fetchProjects);

    if (socket) {
      // Refresh whenever a new notification arrives (Assignments, Project adds)
      socket.on("notification:new", handleUpdate);
      socket.on("dashboard:update", handleUpdate);
      socket.on("project:deleted", handleUpdate);
    }

    return () => {
      window.removeEventListener("taskUpdate", fetchMyTasks);
      window.removeEventListener("projectUpdate", fetchProjects);
      if (socket) {
        socket.off("notification:new", handleUpdate);
        socket.off("dashboard:update", handleUpdate);
        socket.off("project:deleted", handleUpdate);
      }
    };
  }, [orgId, user?.id]);

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

          <button
            onClick={() => navigate("/settings")}
            className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors border border-neutral-700"
          >
            My Profile
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="stat-card">
            <StatCard
              label="Total Projects"
              value={projects.length}
              sub="projects in Cloud Ops"
              icon={Folder}
              color="bg-blue-500/10 text-blue-500"
            />
          </div>
          <div className="stat-card">
            <StatCard
              label="Completed"
              value={completedProjects}
              sub="of total projects"
              icon={CheckCircle}
              color="bg-green-500/10 text-green-500"
            />
          </div>
          <div className="stat-card">
            <StatCard
              label="My Tasks"
              value={myTasks.length}
              sub="assigned to me"
              icon={Clock}
              color="bg-purple-500/10 text-purple-500"
            />
          </div>
          <div className="stat-card">
            <StatCard
              label="Overdue"
              value={overdueTasks.length}
              sub="needs attention"
              icon={AlertTriangle}
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
const StatCard = ({ label, value, sub, icon: Icon, color }) => (
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

const TaskItem = ({ title, priority, type = "TASK", status }) => {
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
