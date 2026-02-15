import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  ArrowLeft,
  FileText,
  X,
  Trash2,
  Check,
  ChevronDown,
  UserPlus,
  MessageSquare,
  Send,
  AlertCircle,
  CheckCircle,
  Upload,
  Link as LinkIcon,
  Github,
  Image as ImageIcon,
  VenetianMask, 
} from "lucide-react";
import { useUser, useAuth } from "@clerk/clerk-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../../services/api";
import { getSocket } from "../../services/socket";
import { uploadFile } from "../../services/supabase";
import PageTransition from "../../components/common/PageTransition";

const TaskDetails = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const { orgRole } = useAuth();
  const queryClient = useQueryClient();

  // State
  const [memberStatuses, setMemberStatuses] = useState({});
  
  // Approval UI State
  const [showApprovalBox, setShowApprovalBox] = useState(false);
  const [actionType, setActionType] = useState(null);


  // Attachment UI State
  const [attachmentMode, setAttachmentMode] = useState("LINK");
  const [newLink, setNewLink] = useState({ name: "", url: "", type: "DOC" });
  const [isUploading, setIsUploading] = useState(false);
  const attachmentFileRef = useRef(null);

  // UI State
  const [isAssigneeOpen, setIsAssigneeOpen] = useState(false);
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const assigneeRef = useRef(null);
  const inviteRef = useRef(null);

  // --- QUERIES ---

  // 1. Fetch Task
  const { 
    data: task, 
    isLoading: loadingTask, 
    error: taskError 
  } = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => {
      const res = await api.get(`/tasks/${taskId}`);
      return res.data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
    retry: 1,
    initialData: () => {
       // Optional: Try to find this task in the project-tasks cache if not exists
       // This is a backup if seeding didn't happen for some reason
       const queryCache = queryClient.getQueryCache();
       const projectTasksQueries = queryCache.findAll(["project-tasks"]);
       for (const query of projectTasksQueries) {
          const task = query.state.data?.find(t => t._id === taskId);
          if (task) return task;
       }
       return undefined;
    }
  });


  // 3. Fetch Project Members (Dependent on Task)
  const projectId = task?.projectId?._id || task?.projectId;
  const { data: projectMembers = [] } = useQuery({
    queryKey: ["project-members", projectId],
    queryFn: async () => {
      const res = await api.get(`/projects/${projectId}/members`);
      return res.data;
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 10,
  });

  // --- MUTATIONS ---

  // Update Task Mutation
  const updateTaskMutation = useMutation({
    mutationFn: async (updates) => {
      await api.put(`/tasks/${taskId}`, updates);
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries(["task", taskId]);
      const previousTask = queryClient.getQueryData(["task", taskId]);
      
      queryClient.setQueryData(["task", taskId], (old) => ({ ...old, ...updates }));
      
      return { previousTask };
    },
    onError: (err, newTodo, context) => {
      queryClient.setQueryData(["task", taskId], context.previousTask);
      toast.error("Failed to update task");
    },
    onSettled: () => {
      queryClient.invalidateQueries(["task", taskId]);
    },
  });


  // Delete Task Mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/tasks/${taskId}`);
    },
    onSuccess: () => {
      toast.success("Task deleted");
      navigate(-1);
    },
    onError: () => {
      toast.error("Failed to delete task");
    }
  });

  const isAdmin = orgRole === "org:admin";
  const isAssignee = task?.assignees?.includes(user?.id);

  // Fetch member availability statuses (Keep this local effect for now, could be a query)
  useEffect(() => {
    const fetchStatuses = async () => {
      if (!projectMembers.length) return;
      
      const userIds = projectMembers.map((m) => m.clerkId);
      try {
        const res = await api.post("/users/status/batch", { userIds });
        const statusMap = {};
        Object.entries(res.data).forEach(([uid, data]) => {
          statusMap[uid] = data.status;
        });
        setMemberStatuses(statusMap);
      } catch (error) {
        console.error("Failed to fetch batch statuses", error);
      }
    };

    if (projectMembers.length > 0) {
      fetchStatuses();
    }
  }, [projectMembers]);

  // Socket Listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !projectId) return;

    socket.emit("join_project", `project_${projectId}`);

    // Join organization room if available
    const orgId = typeof task?.projectId === "object" ? task.projectId.orgId : null; // Access nested if populated
    if (orgId) {
      socket.emit("join_org", orgId);
    }

    const handleTaskUpdated = (updatedTask) => {
      if (updatedTask._id === taskId) {
        queryClient.setQueryData(["task", taskId], (old) => ({ ...old, ...updatedTask }));
      }
    };

    const handleNewActivity = (activity) => {
        if (activity.taskId === taskId && activity.userId !== user.id) {
           queryClient.setQueryData(["task", taskId], (old) => ({ ...old, hasUnread: true }));
        }
    };

    const handleTeamUpdate = () => {
       queryClient.invalidateQueries(["project-members", projectId]);
    };

    socket.on("task:updated", handleTaskUpdated);
    socket.on("task:activity", handleNewActivity);
    socket.on("team:update", handleTeamUpdate);

    return () => {
      socket.off("task:updated", handleTaskUpdated);
      socket.off("task:activity", handleNewActivity);
      socket.off("team:update", handleTeamUpdate);
    };
  }, [taskId, projectId, queryClient, task, user.id]);

  // Actions
  const handleUpdate = (field, value) => {
    updateTaskMutation.mutate({ [field]: value });
  };

  const handleDeleteTask = () => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    deleteTaskMutation.mutate();
  };

  // --- File Upload Handler ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const toastId = toast.loading("Uploading file...");

    try {
      const { url, error } = await uploadFile(file);
      if (error) throw error;
      
      const newAttachment = {
          name: file.name,
          url: url,
          type: file.type.startsWith("image/") ? "IMAGE" : "DOC"
      };
      
      // Update attachments via mutation
      const updatedAttachments = [...(task.attachments || []), newAttachment];
      handleUpdate("attachments", updatedAttachments);
      
      toast.success("File uploaded", { id: toastId });
      setAttachmentMode("LINK");
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error("Failed to upload file", { id: toastId });
    } finally {
      setIsUploading(false);
      if (attachmentFileRef.current) attachmentFileRef.current.value = "";
    }
  };


  // --- Attachments (Links) ---
  const handleAddLink = () => {
    if (!newLink.name || !newLink.url) return;
    const updatedAttachments = [...(task.attachments || []), newLink];
    handleUpdate("attachments", updatedAttachments);
    setNewLink({ name: "", url: "", type: "DOC" });
  };

  const removeLink = (index) => {
    if (!window.confirm("Remove this attachment?")) return;
    const updatedAttachments = task.attachments.filter((_, i) => i !== index);
    handleUpdate("attachments", updatedAttachments);
  };



  const handleToggleAssignee = (memberId) => {
    let newAssignees = [...(task.assignees || [])];
    if (newAssignees.includes(memberId)) {
      newAssignees = newAssignees.filter((id) => id !== memberId);
    } else {
      newAssignees.push(memberId);
    }
    handleUpdate("assignees", newAssignees);
  };

  const handleInvite = async (memberId) => {
    try {
      await api.post(`/tasks/${taskId}/invite`, { targetUserId: memberId });
      toast.success("Invitation sent!");
      setIsInviteOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.message || "Failed to send invite");
    }
  };

  // Approval Mutation
  const approvalMutation = useMutation({
    mutationFn: async ({ actionType, comment }) => {
      const endpoint = actionType === "APPROVE" ? "approve" : "disapprove";
      const res = await api.put(`/tasks/${taskId}/${endpoint}`, {
        comment,
        adminName: user.fullName || user.firstName,
      });
      return res.data;
    },
    onMutate: async ({ actionType }) => {
      await queryClient.cancelQueries(["task", taskId]);
      await queryClient.cancelQueries(["task-activities", taskId]);

      const previousTask = queryClient.getQueryData(["task", taskId]);
      const previousActivities = queryClient.getQueryData(["task-activities", taskId]);
      
      const isApproved = actionType === "APPROVE";
      const status = isApproved ? "Done" : "In Progress";
      
      // Update Task
      queryClient.setQueryData(["task", taskId], (old) => ({
         ...old,
         isApproved,
         status
      }));

      return { previousTask, previousActivities };
    },
    onError: (err, vars, context) => {
      queryClient.setQueryData(["task", taskId], context.previousTask);
      queryClient.setQueryData(["task-activities", taskId], context.previousActivities);
      toast.error("Action failed");
    },
    onSuccess: (data) => {
       if (data.task) {
         queryClient.setQueryData(["task", taskId], (old) => ({ ...old, ...data.task }));
       }
    },
    onSettled: () => {
      // still invalidate task status to be safe
      queryClient.invalidateQueries(["task", taskId]);
    },
  });

  const handleApprovalAction = () => {
    approvalMutation.mutate({ actionType, comment: "" });
    setShowApprovalBox(false);
  };

  const getDaysLeft = () => {
    if (!task.approvedAt) return 15;
    const approvalDate = new Date(task.approvedAt);
    const expireDate = new Date(
      approvalDate.setDate(approvalDate.getDate() + 15)
    );
    const diffTime = expireDate - new Date();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };


  if (loadingTask) return <div className="p-8 text-neutral-400">Loading...</div>;

  const errorMessage = taskError?.response?.data?.message || taskError?.message;

  // 👇 HUMOROUS ACCESS DENIED SCREEN
  if (errorMessage && (errorMessage.includes("Access Denied") || taskError?.response?.status === 403)) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-300">
        <div className="bg-red-500/10 p-6 rounded-full mb-6 border border-red-500/20 shadow-[0_0_30px_rgba(239,68,68,0.2)]">
          <VenetianMask size={64} className="text-red-500" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-3">
          Access Denied! 🕵️‍♂️
        </h1>
        <p className="text-neutral-400 text-lg max-w-md leading-relaxed mb-8">
          Hmmm...{" "}
          <span className="text-red-400 font-medium">
            Why are you trying to peek in someone else's task?
          </span>{" "}
          🌚
          <br />
          This task is classified. If you're supposed to be here, better ask for
          an invite!
        </p>
        <button
          onClick={() => navigate(-1)}
          className="bg-neutral-800 hover:bg-neutral-700 text-white px-6 py-3 rounded-xl font-medium transition-all border border-neutral-700 hover:border-neutral-600 flex items-center gap-2"
        >
          <ArrowLeft size={18} />
          Back to Safety
        </button>
      </div>
    );
  }

  if (!task) return <div className="p-8 text-neutral-400">Task not found</div>;

  return (
    <PageTransition>
      <div className="space-y-6 pb-10 h-full flex flex-col">
        <div className="flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2">
             <button
                onClick={() => navigate(-1)}
                className="text-neutral-400 hover:text-white flex items-center gap-2"
             >
                <ArrowLeft size={18} /> Back
             </button>
          </div>
        
          <div className="flex items-center gap-2 sm:gap-3">
             <button
                onClick={() => navigate(`/tasks/${taskId}/chat`)}
                className="flex items-center gap-2 bg-[#25D366] hover:bg-[#128C7E] text-white px-2 sm:px-3 py-1.5 rounded-lg transition-colors text-sm font-medium relative"
                title="Open Chat"
             >
                <MessageSquare size={16} /> 
                <span className="hidden sm:inline">Open Chat</span>
                {task.hasUnread && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#0b141a]"></span>
                )}
             </button>

             {isAdmin && (
                <button
                onClick={handleDeleteTask}
                className="flex items-center gap-2 text-red-500 hover:text-red-400 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-sm font-medium"
                title="Delete Task"
                >
                <Trash2 size={16} /> 
                <span className="hidden sm:inline">Delete Task</span>
                </button>
             )}
          </div>
        </div>

        {task.isApproved && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-center justify-between animate-in slide-in-from-top-2">
            <div className="flex items-center gap-3">
              <CheckCircle className="text-green-500" size={24} />
              <div>
                <h3 className="text-green-500 font-bold">Approved</h3>
                <p className="text-green-400/70 text-sm">
                  Task verified. Auto-deletion in{" "}
                  <span className="font-bold text-white">
                    {getDaysLeft()} days
                  </span>
                  .
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          
          {/* RIGHT COLUMN: Metadata (Appears FIRST on Mobile) */}
          <div className="space-y-6 lg:col-start-3 lg:col-span-1">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6 sticky top-0">
              {/* Status */}
              <div className="space-y-2">
                <label className="text-xs text-neutral-500 uppercase font-bold tracking-wider">
                  Status
                </label>
                <select
                  value={task.status}
                  onChange={(e) => handleUpdate("status", e.target.value)}
                  className="w-full p-2.5 rounded-lg border font-medium outline-none appearance-none cursor-pointer bg-neutral-800 text-neutral-300 border-neutral-700 hover:bg-neutral-700"
                >
                  <option value="To Do">To Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Done">Done</option>
                </select>
              </div>

              {/* Gallery */}
              <div className="space-y-2">
                <label className="text-xs text-neutral-500 uppercase font-bold tracking-wider">
                  Gallery
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {task.attachments
                    ?.filter((a) => a.type === "IMAGE")
                    .map((img, idx) => (
                      <a
                        key={idx}
                        href={img.url}
                        target="_blank"
                        rel="noreferrer"
                        className="aspect-square bg-neutral-950 rounded-lg border border-neutral-800 overflow-hidden hover:opacity-80 transition-opacity"
                      >
                        <img
                          src={img.url}
                          className="w-full h-full object-cover"
                          alt="attachment"
                        />
                      </a>
                    ))}
                  {(!task.attachments ||
                    task.attachments.filter((a) => a.type === "IMAGE")
                      .length === 0) && (
                    <div className="col-span-3 text-xs text-neutral-600 py-2 italic text-center border border-neutral-800 border-dashed rounded-lg">
                      No images uploaded
                    </div>
                  )}
                </div>
              </div>

              {/* Assignees & Request Help */}
              <div className="space-y-2">
                <label className="text-xs text-neutral-500 uppercase font-bold flex justify-between">
                  <span>Assignees</span>
                  <span className="text-[10px] bg-neutral-800 px-1.5 rounded">
                    {task.assignees?.length || 0}
                  </span>
                </label>
                <div className="relative" ref={assigneeRef}>
                  <button
                    type="button"
                    disabled={!isAdmin}
                    onClick={() => setIsAssigneeOpen(!isAssigneeOpen)}
                    className={`w-full bg-neutral-950 border border-neutral-800 rounded-lg p-2.5 text-left flex justify-between items-center ${
                      isAdmin ? "hover:border-neutral-700" : ""
                    }`}
                  >
                    <div className="flex -space-x-2 overflow-hidden items-center h-6">
                      {task.assignees && task.assignees.length > 0 ? (
                        task.assignees.map((id) => {
                          const mem = projectMembers.find(
                            (m) => m.clerkId === id
                          );
                          if (!mem) return null;
                          return (
                            <img
                              key={id}
                              src={mem.photo}
                              className="w-6 h-6 rounded-full ring-2 ring-neutral-900 bg-neutral-800 object-cover"
                            />
                          );
                        })
                      ) : (
                        <span className="text-sm text-neutral-500 italic">
                          Unassigned
                        </span>
                      )}
                    </div>
                    {isAdmin && (
                      <ChevronDown size={14} className="text-neutral-500" />
                    )}
                  </button>
                  {isAssigneeOpen && isAdmin && (
                    <div className="absolute top-full left-0 mt-2 w-full bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-20 max-h-60 overflow-y-auto">
                      {projectMembers.map((member) => (
                        <div
                          key={member.clerkId}
                          onClick={() => handleToggleAssignee(member.clerkId)}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-neutral-800 cursor-pointer"
                        >
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              task.assignees?.includes(member.clerkId)
                                ? "bg-blue-600 border-blue-600"
                                : "border-neutral-600"
                            }`}
                          >
                            {task.assignees?.includes(member.clerkId) && (
                              <Check size={12} className="text-white" />
                            )}
                          </div>
                          <span className="text-sm text-neutral-300 truncate">
                            {member.firstName} {member.lastName}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {(isAssignee || isAdmin) && (
                <div className="pt-2 relative" ref={inviteRef}>
                  <button
                    onClick={() => setIsInviteOpen(!isInviteOpen)}
                    className="w-full flex items-center justify-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white py-2.5 rounded-lg text-sm font-medium border border-neutral-700"
                  >
                    <UserPlus size={16} /> Request Help
                  </button>
                  {isInviteOpen && (
                    <div className="absolute top-full left-0 mt-2 w-full bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl z-20 p-1">
                      {projectMembers
                        .filter((m) => !task.assignees?.includes(m.clerkId))
                        .filter((m) => memberStatuses[m.clerkId] !== "on_leave") // Hide on-leave members
                        .map((m) => (
                          <div
                            key={m.clerkId}
                            onClick={() => handleInvite(m.clerkId)}
                            className="flex items-center gap-3 px-3 py-2 hover:bg-neutral-800 cursor-pointer rounded-md"
                          >
                            <img
                              src={m.photo}
                              className="w-6 h-6 rounded-full"
                            />
                            <span className="text-sm text-neutral-300">
                              {m.firstName}
                            </span>
                          </div>
                        ))}
                      {projectMembers
                        .filter((m) => !task.assignees?.includes(m.clerkId))
                        .filter((m) => memberStatuses[m.clerkId] !== "on_leave").length === 0 && (
                        <div className="px-3 py-2 text-sm text-neutral-500 text-center">
                          No available members
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* LEFT COLUMN: Details & Attachments (Appears SECOND on Mobile) */}
          <div className="space-y-6 overflow-y-auto pr-2 custom-scrollbar lg:col-start-1 lg:col-span-2 lg:row-start-1">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
              <div className="space-y-1 mb-4">
                <label className="text-xs text-neutral-500 uppercase font-bold tracking-wider">
                  Task Title
                </label>
                {isAdmin ? (
                  <input
                    type="text"
                    value={task.title}
                    onChange={(e) =>
                      queryClient.setQueryData(["task", taskId], (old) => ({
                        ...old,
                        title: e.target.value,
                      }))
                    }
                    onBlur={(e) => handleUpdate("title", e.target.value)}
                    className="w-full bg-transparent text-2xl font-bold text-white focus:outline-none border-b border-neutral-800 focus:border-blue-600 transition-colors pb-2"
                  />
                ) : (
                  <h1 className="text-2xl font-bold text-white">
                    {task.title}
                  </h1>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-xs text-neutral-500 uppercase font-bold tracking-wider">
                  Description
                </label>
                {isAdmin ? (
                  <textarea
                    value={task.description}
                    onChange={(e) =>
                      queryClient.setQueryData(["task", taskId], (old) => ({
                        ...old,
                        description: e.target.value,
                      }))
                    }
                    onBlur={(e) => handleUpdate("description", e.target.value)}
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-neutral-300 focus:outline-none focus:border-blue-600 min-h-[100px] resize-y"
                  />
                ) : (
                  <div className="text-neutral-300 whitespace-pre-wrap leading-relaxed">
                    {task.description || (
                      <span className="italic text-neutral-500">
                        No description.
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {isAdmin && task.status === "Done" && !task.isApproved && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6 animate-in fade-in slide-in-from-top-4">
                <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                  <AlertCircle size={20} className="text-blue-400" /> Admin
                  Action Required
                </h3>
                <p className="text-neutral-400 text-sm mb-4">
                  Task marked as Done. Review required.
                </p>
                {!showApprovalBox ? (
                  <div className="flex flex-wrap gap-3">
                    <button
                      onClick={() => {
                        setActionType("APPROVE");
                        setShowApprovalBox(true);
                      }}
                      className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                      <Check size={16} /> Approve
                    </button>
                    <button
                      onClick={() => {
                        setActionType("REJECT");
                        setShowApprovalBox(true);
                      }}
                      className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                    >
                      <X size={16} /> Disapprove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 bg-neutral-950 p-4 rounded-lg border border-neutral-800 animate-in zoom-in-95 duration-200">
                    <p className="text-sm text-white font-medium">
                      {actionType === "APPROVE"
                        ? "Approve & Schedule Deletion?"
                        : "Disapprove & Revert to In Progress?"}
                    </p>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setShowApprovalBox(false)}
                        className="text-neutral-400 text-sm hover:text-white px-3"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleApprovalAction}
                        className={`px-4 py-2 rounded-lg text-sm text-white font-medium ${
                          actionType === "APPROVE"
                            ? "bg-green-600 hover:bg-green-500"
                            : "bg-red-600 hover:bg-red-500"
                        }`}
                      >
                        Confirm
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ATTACHMENTS SECTION */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
              <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <LinkIcon size={20} /> Attachments
              </h2>

              <div className="space-y-3 mb-6">
                {task.attachments && task.attachments.length > 0 ? (
                  task.attachments.map((link, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-neutral-950 p-3 rounded-lg border border-neutral-800 hover:border-neutral-700 transition-colors group"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        {link.type === "GITHUB" ? (
                          <Github size={20} className="text-white shrink-0" />
                        ) : link.type === "IMAGE" ? (
                          <ImageIcon
                            size={20}
                            className="text-purple-400 shrink-0"
                          />
                        ) : (
                          <FileText
                            size={20}
                            className="text-blue-400 shrink-0"
                          />
                        )}
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm font-medium text-white truncate">
                            {link.name}
                          </span>
                          <a
                            href={link.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-400 hover:underline truncate"
                          >
                            {link.url}
                          </a>
                        </div>
                      </div>
                      <button
                        onClick={() => removeLink(idx)}
                        className="text-neutral-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100 p-1"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-neutral-500 text-sm italic text-center py-4 border border-dashed border-neutral-800 rounded-lg">
                    No attachments.
                  </p>
                )}
              </div>

              {/* Add Box */}
              <div className="bg-neutral-950/50 p-4 rounded-lg border border-neutral-800">
                <div className="flex gap-4 border-b border-neutral-800 mb-4 text-xs font-medium">
                  <button
                    onClick={() => setAttachmentMode("LINK")}
                    className={`pb-2 ${
                      attachmentMode === "LINK"
                        ? "text-blue-400 border-b-2 border-blue-400"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    External Link
                  </button>
                  <button
                    onClick={() => setAttachmentMode("FILE")}
                    className={`pb-2 ${
                      attachmentMode === "FILE"
                        ? "text-blue-400 border-b-2 border-blue-400"
                        : "text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    Upload File
                  </button>
                </div>

                {attachmentMode === "LINK" ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        placeholder="Name"
                        value={newLink.name}
                        onChange={(e) =>
                          setNewLink({ ...newLink, name: e.target.value })
                        }
                        className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600"
                      />
                      <input
                        placeholder="URL"
                        value={newLink.url}
                        onChange={(e) =>
                          setNewLink({ ...newLink, url: e.target.value })
                        }
                        className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <select
                        value={newLink.type}
                        onChange={(e) =>
                          setNewLink({ ...newLink, type: e.target.value })
                        }
                        className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none cursor-pointer w-full sm:w-auto"
                      >
                        <option value="DOC">Doc</option>
                        <option value="GITHUB">GitHub</option>
                        <option value="LINK">Link</option>
                      </select>
                      <button
                        onClick={handleAddLink}
                        disabled={!newLink.name || !newLink.url}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto sm:flex-1 disabled:opacity-50"
                      >
                        Add Link
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      ref={attachmentFileRef}
                      className="hidden"
                      onChange={handleFileUpload}
                    />
                    <button
                      onClick={() => attachmentFileRef.current.click()}
                      className="flex-1 bg-neutral-900 border border-neutral-700 border-dashed rounded-lg py-8 text-neutral-400 hover:text-white hover:border-neutral-500 transition-colors flex flex-col items-center gap-2"
                    >
                      {isUploading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                          <span className="text-sm">Uploading...</span>
                        </>
                      ) : (
                        <>
                          <Upload size={24} />
                          <span className="text-sm">Click to upload file</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>
    </PageTransition>
  );
};



export default TaskDetails;
