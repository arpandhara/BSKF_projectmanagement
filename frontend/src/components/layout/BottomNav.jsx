import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Home,
  FolderKanban,
  CheckSquare,
  Bell,
  Menu,
  Users,
  Settings,
  LogOut,
  X,
  Building,
} from "lucide-react";
import { useAuth, useClerk, OrganizationSwitcher } from "@clerk/clerk-react";
import { dark } from "@clerk/themes";
import { useNavCounts } from "../../hooks/useNavCounts";

const BottomNav = () => {
  const { orgId } = useAuth();
  const { pendingCount } = useNavCounts();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // if (!orgId) return null; // Removed

  return (
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#0b141a] via-[#0b141a]/50 to-transparent flex justify-around items-end z-50 px-2 pb-6">
        {orgId ? (
          <>
            <NavLink
              to="/"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
                  isActive ? "text-white" : "text-neutral-500"
                }`
              }
            >
              <Home size={24} />
            </NavLink>

            <NavLink
              to="/projects"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
                  isActive ? "text-white" : "text-neutral-500"
                }`
              }
            >
              <FolderKanban size={24} />
            </NavLink>

            <NavLink
              to="/notifications"
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
                  isActive ? "text-white" : "text-neutral-500"
                }`
              }
            >
              <div className="relative">
                <Bell size={24} />
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-neutral-900">
                    {pendingCount}
                  </span>
                )}
              </div>
            </NavLink>
          </>
        ) : (
           // Placeholder for spacing if needed, or just let Menu button center itself?
           // If we maximize spacing, putting a "Select Org" text or nothing might be better.
           // Let's keep it simple: just the Menu button will be visible.
           <div className="flex-1"></div> // Push menu to right? Or center?
           // Actually, justify-around with one item centers it.
           // Let's add a dummy spacer to push Menu to the right/end to match usual position
           // <div className="flex-grow"></div> 
           // But actually user probably wants access to menu. Centered is fine for "Login/Select mode".
           // But let's try to keep it on the right to match muscle memory?
           // No, center is better for "I need an action".
        )}

        <button
          onClick={() => setIsMenuOpen(true)}
          className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors ${
            isMenuOpen ? "text-white" : "text-neutral-500"
          }`}
        >
          <div className="w-6 h-6 rounded-full bg-neutral-800 border-2 border-current flex items-center justify-center overflow-hidden">
             <Menu size={14}/>
          </div>
        </button>
      </div>

      {/* Menu Drawer */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setIsMenuOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 bg-neutral-900 rounded-t-2xl border-t border-neutral-800 p-4 animate-in slide-in-from-bottom duration-300">
            <div className="w-12 h-1 bg-neutral-800 rounded-full mx-auto mb-6" />
            
            <div className="space-y-4">
              <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800">
                 <OrganizationSwitcher
                    appearance={{
                        baseTheme: dark,
                        elements: {
                        rootBox: "w-full",
                        organizationSwitcherTrigger: "w-full flex items-center justify-between p-2 rounded-md hover:bg-neutral-800 transition-colors",
                        organizationPreviewTextContainer: "ml-2 text-white",
                        organizationPreviewText: "font-medium text-sm text-white",
                        organizationSwitcherTriggerIcon: "text-neutral-400",
                        userPreviewTextContainer: "ml-2 text-white",
                        userPreviewText: "font-medium text-sm text-white",
                        card: "bg-neutral-950 border border-neutral-800",
                        organizationSwitcherPopoverCard: "bg-neutral-950 border border-neutral-800",
                        scrollBox: "bg-neutral-950",
                        navbar: "hidden",
                        }
                    }}
                 />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {orgId && <MenuTile Icon={Users} label="Team" onClick={() => { navigate("/team"); setIsMenuOpen(false); }} />}
                {orgId && <MenuTile Icon={Settings} label="Settings" onClick={() => { navigate("/settings"); setIsMenuOpen(false); }} />}
                <MenuTile Icon={Building} label="Create Org" onClick={() => { navigate("/create-organization"); setIsMenuOpen(false); }} />
                <MenuTile Icon={LogOut} label="Logout" danger onClick={() => signOut()} />
              </div>
            </div>

            <button
              onClick={() => setIsMenuOpen(false)}
              className="mt-6 w-full py-3 bg-neutral-800 rounded-xl text-white font-medium"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// eslint-disable-next-line no-unused-vars
const MenuTile = ({ Icon, label, onClick, danger }) => (
  <button
    onClick={onClick}
    className={`flex flex-col items-center justify-center p-4 rounded-xl border transition-colors ${
      danger
        ? "bg-red-500/10 border-red-500/20 text-red-400 hover:bg-red-500/20"
        : "bg-neutral-950 border-neutral-800 text-neutral-300 hover:bg-neutral-800 hover:text-white"
    }`}
  >
    <Icon size={24} className="mb-2" />
    <span className="text-sm font-medium">{label}</span>
  </button>
);

export default BottomNav;
