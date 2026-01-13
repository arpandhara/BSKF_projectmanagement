import React, { useState, useEffect , useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useClerk, useAuth, OrganizationSwitcher, useUser } from "@clerk/clerk-react";
import gsap from "gsap"; 
import { useGSAP } from "@gsap/react"; 
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  Settings,
  CheckSquare,
  Plus,
  LogOut,

  Building, 
  Bell
} from "lucide-react";
import api from "../../services/api";
import { getSocket } from "../../services/socket"; 
import { useQuery, useQueryClient } from "@tanstack/react-query";

function Sidebar() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const { orgId, orgRole } = useAuth(); 
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  // const [projects, setProjects] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [myTaskCount, setMyTaskCount] = useState(0);

  const sidebarRef = useRef(null);

  // Permission Logic
  const isGlobalAdmin = user?.publicMetadata?.role === "admin";
  const isOrgAdmin = orgRole === "org:admin";
  const canCreateOrg = isGlobalAdmin || isOrgAdmin;

  const { data: projects = [] } = useQuery({
    queryKey: ["projects", orgId], // Unique key for this data
    queryFn: async () => {
      const response = await api.get("/projects", { params: { orgId } });
      return Array.isArray(response.data) ? response.data : [];
    },
    enabled: !!orgId, // Only fetch if we have an Org ID
    staleTime: 1000 * 60 * 5, // Cache data for 5 minutes (prevents refetching on every render)
  });

  useGSAP(() => {
    gsap.fromTo(".nav-item", 
      { x: -20, opacity: 0 }, 
      { x: 0, opacity: 1, duration: 0.4, stagger: 0.05, ease: "power2.out", delay: 0.2 }
    );
  }, { scope: sidebarRef }); // Empty dependency array implied

  // 2. Project List Animation (Run when projects change)
  useGSAP(() => {
    if (projects.length > 0) {
      gsap.fromTo(".project-item", 
        { x: -20, opacity: 0 },
        { x: 0, opacity: 1, duration: 0.5, stagger: 0.05, ease: "power2.out" }
      );
    }
  }, { scope: sidebarRef, dependencies: [projects] });

  const fetchNotificationCounts = async () => {
    let total = 0;
    try {
      const userRes = await api.get("/notifications");
      const unreadCount = userRes.data.filter(n => !n.read).length;
      total += unreadCount;
    } catch (error) {
      console.error("User notification error:", error);
    }

    if (orgId && canCreateOrg) {
      try {
        const adminRes = await api.get("/admin-actions/pending", { params: { orgId } });
        total += adminRes.data.length;
      } catch (error) { }
    }
    setPendingCount(total);
  };

  const fetchMyTaskCount = async () => {
    if (!user?.id) return;
    try {
      const res = await api.get(`/tasks/user/${user.id}`);
      setMyTaskCount(res.data.length);
    } catch (error) {
      console.error("Failed to fetch my tasks", error);
    }
  };

  useEffect(() => {
    fetchNotificationCounts(); 
    fetchMyTaskCount(); 

    const invalidateProjects = () => queryClient.invalidateQueries(["projects", orgId]);

    // Listeners for updates (Legacy window events)
    window.addEventListener("projectUpdate", invalidateProjects);
    window.addEventListener("notificationUpdate", fetchNotificationCounts);
    window.addEventListener("taskUpdate", fetchMyTaskCount);

    return () => {
      window.removeEventListener("projectUpdate", invalidateProjects);
      window.removeEventListener("notificationUpdate", fetchNotificationCounts);
      window.removeEventListener("taskUpdate", fetchMyTaskCount);
    };
  }, [orgId, canCreateOrg, user?.id]); 

  // 2. SOCKET: Listen for Live Notifications
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // A. Join Organization Room when orgId changes
    if (orgId) {
      socket.emit("join_org", orgId);
    }

    // B. Handle Notification (Existing)
    const handleNotification = (newNotification) => {
      setPendingCount((prev) => prev + 1);
      const event = new CustomEvent("show-toast", {
        detail: { message: newNotification.message, link: "/notifications" }
      });
      window.dispatchEvent(event);
    };

    const handleProjectDeleted = (deletedProjectId) => {
      queryClient.setQueryData(["projects", orgId], (oldData) => {
        if (!oldData) return [];
        return oldData.filter((p) => (p._id || p.id) !== deletedProjectId);
      });
    };

    socket.on("notification:new", handleNotification);
    socket.on("project:deleted", handleProjectDeleted);

    return () => {
      socket.off("notification:new", handleNotification);
      socket.off("project:deleted", handleProjectDeleted);
    };
  }, [orgId]);



  const navItems = [
    ...(orgId ? [
      { icon: LayoutDashboard, label: "Dashboard", path: "/" },
      { icon: FolderKanban, label: "Projects", path: "/projects" },
      { icon: Users, label: "Team", path: "/team" }
    ] : []),

    ...(orgId ? [{ icon: Bell, label: "Notifications", path: "/notifications", badge: pendingCount }] : []),
    ...(canCreateOrg ? [{ icon: Building, label: "Create Org", path: "/create-organization" }] : []),
    { icon: Settings, label: "Settings", path: "/settings" },
  ];

  return (
    <aside ref={sidebarRef} className="w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col h-screen left-0 top-0">
      <div className="w-full p-4 border-b border-neutral-800 flex justify-center">
        <OrganizationSwitcher
          appearance={{
            elements: {
              rootBox: "w-full",
              organizationSwitcherTrigger: "w-full flex items-center justify-between p-2 rounded-md hover:bg-neutral-800 transition-colors border border-neutral-800 bg-neutral-900",
              organizationPreviewTextContainer: "ml-2 text-white",
              organizationPreviewText: "font-medium text-sm text-white",
              organizationSwitcherTriggerIcon: "text-neutral-400",
              organizationSwitcherPopoverCard: "bg-neutral-900 border border-neutral-800",
              organizationSwitcherPopoverActionButton: "!bg-white !text-neutral-950 hover:!bg-neutral-200",
              organizationSwitcherInvitationAcceptButton: "!bg-white !text-neutral-950 hover:!bg-neutral-200",
              userPreviewTextContainer: "ml-2 text-white",
              userPreviewText: "font-medium text-sm text-white",
              userPreviewSecondaryText: "text-neutral-400",
            },
            variables: {
              colorText: "white",
              colorTextSecondary: "#a3a3a3",
              colorBackground: "#171717",
              colorInputBackground: "#171717",
              colorInputText: "white"
            }
          }}
        />
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1">
        {navItems.map((items) => (
          <SidebarItem 
            key={items.path}
            to={items.path}
            icon={items.icon}
            label={items.label}
            badge={items.badge}
          />
        ))}

        {orgId && (
          <div className="pt-6">
            <div className="px-3 mb-2 flex items-center justify-between group cursor-pointer nav-item">
              <div className="flex items-center gap-2 text-neutral-400 hover:text-white transition-colors">
                <CheckSquare size={18} />
                <span className="text-sm font-medium">My Tasks</span>
              </div>
              <span className="bg-neutral-800 text-neutral-400 text-xs px-2 py-0.5 rounded-full">
                {myTaskCount}
              </span>
            </div>
          </div>
        )}
      </nav>

      <div className="px-4 pb-2">
        <button
          onClick={() => signOut()}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm text-red-400 hover:bg-neutral-800/50 hover:text-red-300 transition-colors cursor-pointer nav-item"
        >
          <LogOut size={18} className="mr-3" />
          Logout
        </button>
      </div>

      {orgId && (
        <div className="px-4 py-6 border-t border-neutral-800">
          <div className="flex items-center justify-between mb-3 px-2">
            <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Projects</span>
            {canCreateOrg && (
              <Plus
                size={14}
                className="text-neutral-500 cursor-pointer hover:text-white transition-colors"
                onClick={() => navigate("/projects")}
              />
            )}
          </div>

          <div className="space-y-1 overflow-y-auto max-h-[150px] scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent">
            {projects.length > 0 ? (
              projects.map((project) => (
                <div
                  key={project._id || project.id}
                  onClick={() => navigate(`/projects/${project._id || project.id}`)}
                  className="flex items-center gap-2 px-2 py-1.5 text-sm text-neutral-400 hover:text-white cursor-pointer rounded hover:bg-neutral-800/50 transition-colors group"
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${project.status === "ACTIVE" ? "bg-green-500" : "bg-neutral-600"}`}></span>
                  <span className="truncate">{project.title}</span>
                </div>
              ))
            ) : (
              <div className="px-2 text-xs text-neutral-600 italic">No projects in this Org</div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

const SidebarItem = ({ to, icon: Icon, label, badge }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `nav-item flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
        isActive
          ? "bg-blue-600/10 text-blue-400 font-medium"
          : "text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
      }`
    }
  >
    <Icon size={18} />
    <span className="flex-1">{label}</span>
    {badge > 0 && (
      <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
        {badge}
      </span>
    )}
  </NavLink>
);

export default Sidebar;