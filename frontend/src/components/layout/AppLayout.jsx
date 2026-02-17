import React from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";
import ToastContainer from "../common/ToastContainer";
import { Menu } from "lucide-react";

import NotificationToastListener from "../common/NotificationToastListener";

function AppLayout() {

  return (
    <div className="flex min-h-screen bg-neutral-950 text-white relative">
      
      <NotificationToastListener />

      {/* Desktop Sidebar (Hidden on Mobile) */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 w-full mix-blend-normal pb-24 md:pb-8 md:h-screen md:overflow-y-auto">
        <Outlet />
      </main>

      {/* Mobile Bottom Navigation */}
      <BottomNav />

      <ToastContainer />
    </div>
  );
}

export default AppLayout;
