import React, { useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { Check, X, UserMinus, Trash2, Bell, Info } from "lucide-react";
import api from "../../services/api";
import { getSocket } from "../../services/socket";
import PageTransition from "../../components/common/PageTransition";

const Notifications = () => {
  const { orgId, orgRole } = useAuth();
  const { user } = useUser();

  const [adminRequests, setAdminRequests] = useState([]);
  const [userNotifications, setUserNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);

    // 1. Admin Actions
    if (orgRole === "org:admin") {
      try {
        const adminRes = await api.get("/admin-actions/pending", {
          params: { orgId },
        });
        setAdminRequests(adminRes.data || []);
      } catch (error) {
        console.error("Failed to fetch admin notifications", error);
      }
    }

    // 2. User Notifications
    try {
      const userRes = await api.get("/notifications");
      setUserNotifications(userRes.data || []);
    } catch (error) {
      console.error("Failed to fetch user notifications", error);
    }

    setLoading(false);
  };

  useEffect(() => {
    const init = async () => {
      if (orgId) await fetchData();

      try {
        await api.put("/notifications/mark-read");
        window.dispatchEvent(new Event("notificationUpdate"));
      } catch (err) {
        console.error("Failed to mark notifications as read", err);
      }
    };
    init();
  }, [orgId, orgRole]);

  // 3. ⚡ SOCKET: Listen for new notifications live
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleNewNotification = (newNote) => {
      // Prepend to list instantly
      setUserNotifications((prev) => [newNote, ...prev]);

      // Auto-mark as read since we are looking at the page?
      // Optional, but might be nice. For now just show it.
    };

    socket.on("notification:new", handleNewNotification);

    return () => socket.off("notification:new", handleNewNotification);
  }, []);

  // Handle Task Invite Response
  const handleInviteResponse = async (noteId, action) => {
    try {
      await api.post("/tasks/invite/respond", {
        notificationId: noteId,
        action: action, // 'ACCEPT' or 'DECLINE'
      });
      setUserNotifications((prev) => prev.filter((n) => n._id !== noteId));
      window.dispatchEvent(new Event("notificationUpdate"));
      window.dispatchEvent(new Event("taskUpdate"));
    } catch (error) {
      alert("Failed to respond to invite");
    }
  };

  const handleApprove = async (req) => {
    if (!window.confirm(`Are you sure you want to approve this action?`))
      return;

    try {
      let endpoint = "";
      if (req.type === "DEMOTE_ADMIN")
        endpoint = `/admin-actions/demote/approve/${req._id}`;
      if (req.type === "DELETE_ORG")
        endpoint = `/admin-actions/delete-org/approve/${req._id}`;

      await api.post(endpoint);
      alert("Action approved successfully.");

      if (req.type === "DELETE_ORG") {
        window.location.href = "/";
      } else {
        fetchData();
        window.dispatchEvent(new Event("notificationUpdate"));
      }
    } catch (error) {
      alert(error.response?.data?.message || "Failed to approve.");
    }
  };

  const handleDeny = async (req) => {
    if (!window.confirm("Are you sure you want to deny this request?")) return;
    try {
      await api.post(`/admin-actions/reject/${req._id}`);
      alert("Request denied and removed.");
      fetchData();
      window.dispatchEvent(new Event("notificationUpdate"));
    } catch (error) {
      alert(error.response?.data?.message || "Failed to deny.");
    }
  };

  const handleDismiss = async (noteId) => {
    try {
      await api.delete(`/notifications/${noteId}`);
      setUserNotifications((prev) => prev.filter((n) => n._id !== noteId));
      window.dispatchEvent(new Event("notificationUpdate"));
    } catch (error) {
      console.error("Failed to dismiss", error);
    }
  };

  if (loading)
    return <div className="p-8 text-neutral-400">Loading notifications...</div>;

  return (
    <PageTransition>
      <div className="space-y-8 max-w-3xl mx-auto">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          <p className="text-neutral-400 mt-1">Updates and pending actions.</p>
        </div>

        {/* User Notifications */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Bell size={18} /> Inbox
          </h2>
          {userNotifications.length === 0 ? (
            <p className="text-neutral-500 text-sm italic">No new messages.</p>
          ) : (
            userNotifications.map((note) => (
              <div
                key={note._id}
                className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl flex items-center justify-between animate-in slide-in-from-top-2 duration-200"
              >
                <div className="flex items-center gap-4">
                  <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500">
                    <Info size={20} />
                  </div>
                  <p className="text-white text-sm">{note.message}</p>
                </div>

                {note.type === "TASK_INVITE" ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleInviteResponse(note._id, "ACCEPT")}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleInviteResponse(note._id, "DECLINE")}
                      className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-neutral-700"
                    >
                      Decline
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => handleDismiss(note._id)}
                    className="bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  >
                    OK
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Admin Requests */}
        {adminRequests.length > 0 && (
          <div className="space-y-4 pt-6 border-t border-neutral-800">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <UserMinus size={18} /> Admin Approvals
            </h2>
            {adminRequests.map((req) => (
              <div
                key={req._id}
                className="bg-neutral-900 border border-neutral-800 p-5 rounded-xl flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`p-3 rounded-lg ${
                      req.type === "DELETE_ORG"
                        ? "bg-red-500/10 text-red-500"
                        : "bg-orange-500/10 text-orange-500"
                    }`}
                  >
                    {req.type === "DELETE_ORG" ? (
                      <Trash2 size={20} />
                    ) : (
                      <UserMinus size={20} />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">
                      {req.type === "DELETE_ORG"
                        ? "Organization Deletion Request"
                        : "Admin Demotion Request"}
                    </h3>
                    <p className="text-sm text-neutral-400 mt-1">
                      Requested by{" "}
                      <span className="text-white font-medium">
                        {req.requesterName || "Admin"}
                      </span>
                    </p>
                  </div>
                </div>

                {req.requesterUserId !== user.id ? (
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleApprove(req)}
                      className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Check size={16} /> Approve
                    </button>
                    <button
                      onClick={() => handleDeny(req)}
                      className="flex items-center gap-2 bg-red-600/10 hover:bg-red-600/20 text-red-500 border border-red-600/20 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      <X size={16} /> Deny
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-neutral-500 bg-neutral-800 px-2 py-1 rounded">
                    Pending
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </PageTransition>
  );
};

export default Notifications;
