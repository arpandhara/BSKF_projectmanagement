import React, { useRef } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useClerk, useAuth, OrganizationSwitcher } from "@clerk/clerk-react";
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
  Bell,
  X
} from "lucide-react";
import api from "../../services/api";
import { useQuery } from "@tanstack/react-query";
import { useNavCounts } from "../../hooks/useNavCounts";

function Sidebar({ onClose }) {
  const { signOut } = useClerk();
  const { orgId, orgRole } = useAuth(); 
  const navigate = useNavigate();
  
  const { pendingCount, myTaskCount } = useNavCounts();

  const sidebarRef = useRef(null);

  // Permission Logic
  const isOrgAdmin = orgRole === "org:admin";
  const canCreateOrg = isOrgAdmin;

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
    <aside ref={sidebarRef} className="w-64 bg-neutral-900 border-r border-neutral-800 flex flex-col h-full">
      {/* Mobile Close Button (Visible only on mobile in header area usually, but adding here too just in case or for cleaner UI) */}
       <div className="w-full p-4 border-b border-neutral-800 flex justify-between items-center md:justify-center">
         <div className="w-full md:w-auto">
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
         {/* Close Button for Mobile */}
         <button className="md:hidden text-neutral-400 ml-2" onClick={onClose}>
            <X size={20}/>
         </button>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
        {navItems.map((items) => (
          <SidebarItem 
            key={items.path}
            to={items.path}
            Icon={items.icon}
            label={items.label}
            badge={items.badge}
            onClick={onClose}
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

      <div className="px-4 pb-2 mt-auto">
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
                onClick={() => {
                  navigate("/projects");
                  if(onClose) onClose();
                }}
              />
            )}
          </div>

          <div className="space-y-1 overflow-y-auto max-h-[150px] scrollbar-thin scrollbar-thumb-neutral-700 scrollbar-track-transparent">
            {projects.length > 0 ? (
              projects.map((project) => (
                <div
                  key={project._id || project.id}
                  onClick={() => {
                     navigate(`/projects/${project._id || project.id}`);
                     if(onClose) onClose();
                  }}
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

// eslint-disable-next-line no-unused-vars
const SidebarItem = ({ to, Icon, label, badge, onClick }) => (
  <NavLink
    to={to}
    onClick={onClick}
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