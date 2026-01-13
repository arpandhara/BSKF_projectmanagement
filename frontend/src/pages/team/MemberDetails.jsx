import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useOrganization, useUser } from "@clerk/clerk-react";
import {
  Shield,
  Trash2,
  Briefcase,
  CheckSquare,
  AlertTriangle,
} from "lucide-react";
import api from "../../services/api";
import { getSocket } from "../../services/socket"; 

const MemberDetails = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  
  // Clerk hooks
  const { organization, isLoaded } = useOrganization();
  const { user: currentUser } = useUser();

  // State
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  
  // Local state for the specific member being viewed (allows instant updates)
  const [currentMember, setCurrentMember] = useState(null);
  const [loadingMember, setLoadingMember] = useState(true);

  // 1. Fetch Member Details (Manual fetch to ensure fresh data)
  const fetchMemberDetails = async () => {
      if (!organization || !userId) return;
      
      try {
          // Fetch members to find the specific one
          const res = await organization.getMemberships({ pageSize: 100 });
          const found = res.data.find(m => m.publicUserData.userId === userId);
          setCurrentMember(found);
      } catch (e) {
          console.error("Fetch member failed", e);
      } finally {
          setLoadingMember(false);
      }
  };

  // 2. Fetch Associated Data (Projects, Tasks, Admin Requests)
  const fetchData = async () => {
    if (!userId || !organization) return;

    try {
      // Get Projects
      const resProjects = await api.get("/projects", { 
        params: { orgId: organization.id, userId } 
      });
      setProjects(resProjects.data);

      // Get Tasks
      const resTasks = await api.get(`/tasks/user/${userId}`);
      setTasks(resTasks.data);

      // Get Admin Requests (Only if I am looking at this page as an admin)
      // Note: We check if *currentUser* is admin inside the render or via a safe check here
      const iAmAdmin = currentUser?.publicMetadata?.role === "admin" || 
                       organization.membership?.role === "org:admin";
      
      if (iAmAdmin) {
          const resRequests = await api.get("/admin-actions/pending", { 
            params: { orgId: organization.id } 
          });
          setPendingRequests(resRequests.data);
      }
    } catch (err) {
      console.error("Data load failed", err);
    }
  };

  // Initial Load
  useEffect(() => {
      if (isLoaded && organization) {
          fetchMemberDetails();
          fetchData();
      }
  }, [isLoaded, organization, userId]);

  // 3. ⚡ SOCKET: Listen for Live Updates
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    // Handler for any relevant update
    const handleUpdate = () => {
        console.log("⚡ Socket update received in MemberDetails. Refreshing...");
        fetchMemberDetails(); // Refreshes role/status
        fetchData();          // Refreshes tasks/requests
    };

    socket.on("team:update", handleUpdate);       // Promotion/Demotion occurred
    socket.on("notification:new", handleUpdate);  // Task assignment occurred

    return () => {
        socket.off("team:update", handleUpdate);
        socket.off("notification:new", handleUpdate);
    };
  }, [userId, organization]);

  // --- Actions ---

  const handleKick = async () => {
    if (!window.confirm("Remove this user from organization?")) return;
    try {
      await currentMember.destroy();
      alert("User removed.");
      navigate("/team");
    } catch (e) {
      alert("Failed to remove user");
    }
  };

  const handleDemoteRequest = async () => {
    try {
      await api.post("/admin-actions/demote/request", {
        targetUserId: userId,
        orgId: organization.id,
      });
      alert("Demotion requested! Waiting for approval.");
      fetchData(); // Refresh pending requests UI
    } catch (e) {
      alert(e.response?.data?.message || "Failed to request");
    }
  };

  const handlePromote = async () => {
    if (!window.confirm("Promote this user to Admin?")) return;
    try {
        await api.post("/admin-actions/promote", {
            targetUserId: userId,
            orgId: organization.id,
        });
        alert("User promoted!");
        // No reload needed! Socket "team:update" will trigger fetchMemberDetails()
    } catch (e) {
        alert("Failed to promote");
    }
  };

  const handleApproveDemotion = async (requestId) => {
    try {
      await api.post(`/admin-actions/demote/approve/${requestId}`);
      alert("Demotion approved.");
      // No reload needed! Socket will refresh UI
    } catch (e) {
      alert(e.response?.data?.message || "Failed to approve");
    }
  };

  // Loading State
  if (!isLoaded || loadingMember) return <div className="p-8 text-neutral-400">Loading profile...</div>;
  if (!currentMember) return <div className="p-8 text-red-400">Member not found in this organization.</div>;

  // Permissions
  const iAmAdmin = organization?.membership?.role === "org:admin" || currentUser?.publicMetadata?.role === "admin";
  const targetIsAdmin = currentMember.role === "org:admin";
  const isMe = userId === currentUser?.id;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Profile Header */}
      <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img
            src={currentMember.publicUserData.imageUrl}
            className="w-16 h-16 rounded-full bg-neutral-800 object-cover"
            alt="Profile"
          />
          <div>
            <h1 className="text-2xl font-bold text-white">
              {currentMember.publicUserData.firstName} {currentMember.publicUserData.lastName}
            </h1>
            <p className="text-neutral-400">
              {currentMember.publicUserData.identifier}
            </p>
            <span
              className={`inline-block mt-2 text-xs px-2 py-1 rounded font-bold uppercase ${
                targetIsAdmin
                  ? "bg-purple-500/20 text-purple-400"
                  : "bg-blue-500/20 text-blue-400"
              }`}
            >
              {targetIsAdmin ? "Admin" : "Member"}
            </span>
          </div>
        </div>

        {/* Admin Actions */}
        {iAmAdmin && !isMe && (
          <div className="flex flex-col gap-2">
            {targetIsAdmin ? (
              <button
                onClick={handleDemoteRequest}
                className="bg-orange-600/10 text-orange-500 hover:bg-orange-600/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Request Demotion
              </button>
            ) : (
              <button
                onClick={handlePromote}
                className="bg-green-600/10 text-green-500 hover:bg-green-600/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                <Shield size={16} /> Promote to Admin
              </button>
            )}

            <button
              onClick={handleKick}
              className="bg-red-600/10 text-red-500 hover:bg-red-600/20 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 size={16} /> Remove from Org
            </button>
          </div>
        )}
      </div>

      {/* Pending Demotion Alert */}
      {iAmAdmin && pendingRequests.some((r) => r.targetUserId === userId) && (
        <div className="bg-blue-500/10 border border-blue-500/20 p-4 rounded-xl flex items-center justify-between animate-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <AlertTriangle className="text-blue-500" />
            <div>
              <h3 className="text-white font-medium">
                Pending Demotion Request
              </h3>
              <p className="text-sm text-neutral-400">
                Another admin has requested to demote this user.
              </p>
            </div>
          </div>
          {/* Prevent Approving own request (though backend blocks it, UI should too) */}
          {pendingRequests.find((r) => r.targetUserId === userId).requesterUserId !== currentUser.id && (
            <button
              onClick={() =>
                handleApproveDemotion(
                  pendingRequests.find((r) => r.targetUserId === userId)._id
                )
              }
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              Approve Demotion
            </button>
          )}
        </div>
      )}

      {/* Data Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Projects */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Briefcase size={18} /> Involved Projects
          </h2>
          {projects.length > 0 ? (
            <div className="space-y-2">
              {projects.map((p) => (
                <div
                  key={p._id}
                  className="p-3 bg-neutral-950 rounded border border-neutral-800 text-sm hover:border-neutral-700 cursor-pointer transition-colors"
                  onClick={() => navigate(`/projects/${p._id}`)}
                >
                  <div className="flex justify-between items-center">
                    <span className="text-white font-medium">{p.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${p.status === 'ACTIVE' ? 'bg-green-500/20 text-green-400' : 'bg-neutral-800 text-neutral-400'}`}>
                        {p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-neutral-500 text-sm italic">No projects yet.</p>
          )}
        </div>

        {/* Tasks */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <CheckSquare size={18} /> Assigned Tasks
          </h2>
          {tasks.length > 0 ? (
            <div className="space-y-2">
              {tasks.map((t) => (
                <div
                  key={t._id}
                  onClick={() => navigate(`/tasks/${t._id}`)}
                  className="p-3 bg-neutral-950 rounded border border-neutral-800 text-sm cursor-pointer hover:border-neutral-700 transition-colors"
                >
                  <div className="flex justify-between">
                    <span className="text-white font-medium truncate w-2/3">{t.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${t.status === 'Done' ? 'bg-green-500/20 text-green-400' : 'bg-neutral-800 text-neutral-400'}`}>
                      {t.status}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-1 truncate">
                    in {t.projectId?.title || "Unknown Project"}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-neutral-500 text-sm italic">No active tasks.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MemberDetails;