import { useState, useEffect } from "react";
import { useUser, useAuth } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import api from "../services/api";
import { getSocket } from "../services/socket";

export const useNavCounts = () => {
  const { user } = useUser();
  const { orgId, orgRole } = useAuth();
  const queryClient = useQueryClient();

  const [pendingCount, setPendingCount] = useState(0);
  const [myTaskCount, setMyTaskCount] = useState(0);

  const isOrgAdmin = orgRole === "org:admin";


  const fetchNotificationCounts = async () => {
    let total = 0;
    try {
      const userRes = await api.get("/notifications");
      const unreadCount = userRes.data.filter((n) => !n.read).length;
      total += unreadCount;
    } catch (error) {
      console.error("User notification error:", error);
    }

    if (orgId && isOrgAdmin) {
      try {
        const adminRes = await api.get("/admin-actions/pending", {
          params: { orgId },
        });
        total += adminRes.data.length;
      } catch (err) {
        console.error("Admin actions fetch error:", err);
      }
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
    const loadData = async () => {
      await Promise.all([fetchNotificationCounts(), fetchMyTaskCount()]);
    };
    loadData();

    const invalidateProjects = () =>
      queryClient.invalidateQueries(["projects", orgId]);

    // Listeners for updates (Legacy window events)
    const handleProjectUpdate = () => invalidateProjects();
    const handleNotificationUpdate = () => fetchNotificationCounts();
    const handleTaskUpdate = () => fetchMyTaskCount();

    window.addEventListener("projectUpdate", handleProjectUpdate);
    window.addEventListener("notificationUpdate", handleNotificationUpdate);
    window.addEventListener("taskUpdate", handleTaskUpdate);

    return () => {
      window.removeEventListener("projectUpdate", handleProjectUpdate);
      window.removeEventListener("notificationUpdate", handleNotificationUpdate);
      window.removeEventListener("taskUpdate", handleTaskUpdate);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, isOrgAdmin, user?.id]);

  // SOCKET: Listen for Live Notifications
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    if (orgId) {
      socket.emit("join_org", orgId);
    }

    const handleNotification = (newNotification) => {
      setPendingCount((prev) => prev + 1);
      const event = new CustomEvent("show-toast", {
        detail: { message: newNotification.message, link: "/notifications" },
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  return { pendingCount, myTaskCount };
};
