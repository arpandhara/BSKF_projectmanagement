import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
  VenetianMask, // 👈 Added VenetianMask for the funny UI
} from "lucide-react";
import { useUser, useAuth } from "@clerk/clerk-react";
import api from "../../services/api";
import { getSocket } from "../../services/socket";
import { uploadFile } from "../../services/supabase";
import PageTransition from "../../components/common/PageTransition";

const TaskDetails = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useUser();
  const { orgRole } = useAuth();

  const [task, setTask] = useState(null);
  const [activities, setActivities] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null); // 👈 Tracks access errors

  // Approval UI State
  const [approvalComment, setApprovalComment] = useState("");
  const [showApprovalBox, setShowApprovalBox] = useState(false);
  const [actionType, setActionType] = useState(null);

  // Inputs
  const [commentText, setCommentText] = useState("");

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

  const isAdmin =
    user?.publicMetadata?.role === "admin" || orgRole === "org:admin";
  const isAssignee = task?.assignees?.includes(user?.id);

  // 1. Fetch Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const taskRes = await api.get(`/tasks/${taskId}`);
        setTask(taskRes.data);

        const actRes = await api.get(`/tasks/${taskId}/activity`);
        setActivities(actRes.data);

        if (taskRes.data.projectId) {
          const pid = taskRes.data.projectId._id || taskRes.data.projectId;
          const memRes = await api.get(`/projects/${pid}/members`);
          setProjectMembers(memRes.data);
        }
      } catch (err) {
        console.error(err);
        setError(err.response?.data?.message || "Failed to load task");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [taskId]);

  // 2. Socket Listeners
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !task) return;

    const projectId =
      typeof task.projectId === "string" ? task.projectId : task.projectId._id;
    socket.emit("join_project", `project_${projectId}`);

    const handleTaskUpdated = (updatedTask) => {
      if (updatedTask._id === taskId) {
        setTask((prev) => ({ ...updatedTask, projectId: prev.projectId }));
      }
    };

    const handleNewActivity = (newActivity) => {
      if (newActivity.taskId === taskId) {
        setActivities((prev) => [newActivity, ...prev]);
      }
    };

    socket.on("task:updated", handleTaskUpdated);
    socket.on("task:activity", handleNewActivity);

    return () => {
      socket.off("task:updated", handleTaskUpdated);
      socket.off("task:activity", handleNewActivity);
    };
  }, [taskId, task?.projectId]);

  // 3. Actions
  const handleUpdate = async (field, value) => {
    try {
      await api.put(`/tasks/${taskId}`, { [field]: value });
    } catch (err) {
      alert("Failed to update task");
    }
  };

  const handleDeleteTask = async () => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      navigate(-1);
    } catch (err) {
      alert("Failed to delete task");
    }
  };

  // --- Comments ---
  const handlePostComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    try {
      await api.post(`/tasks/${taskId}/activity`, {
        type: "COMMENT",
        content: commentText,
      });
      setCommentText("");
    } catch (error) {
      alert("Failed to post comment");
    }
  };

  // --- Attachments (Links) ---
  const handleAddLink = async () => {
    if (!newLink.name || !newLink.url) return;
    const updatedAttachments = [...(task.attachments || []), newLink];
    await handleUpdate("attachments", updatedAttachments);
    setNewLink({ name: "", url: "", type: "DOC" });
  };

  const removeLink = async (index) => {
    if (!window.confirm("Remove this attachment?")) return;
    const updatedAttachments = task.attachments.filter((_, i) => i !== index);
    await handleUpdate("attachments", updatedAttachments);
  };

  // --- Attachments (File Upload) ---
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const { url, error } = await uploadFile(file);
      if (error) throw error;

      await api.post(`/tasks/${taskId}/activity`, {
        type: "UPLOAD",
        content: "Uploaded a file",
        metadata: {
          fileName: file.name,
          fileUrl: url,
          fileType: file.type.startsWith("image/") ? "IMAGE" : "DOC",
        },
      });
    } catch (error) {
      console.error("Upload failed:", error);
      alert("Failed to upload file.");
    } finally {
      setIsUploading(false);
      if (attachmentFileRef.current) attachmentFileRef.current.value = "";
    }
  };

  const handleToggleAssignee = async (memberId) => {
    let newAssignees = [...(task.assignees || [])];
    if (newAssignees.includes(memberId)) {
      newAssignees = newAssignees.filter((id) => id !== memberId);
    } else {
      newAssignees.push(memberId);
    }
    await handleUpdate("assignees", newAssignees);
  };

  const handleInvite = async (memberId) => {
    try {
      await api.post(`/tasks/${taskId}/invite`, { targetUserId: memberId });
      alert("Invitation sent!");
      setIsInviteOpen(false);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to send invite");
    }
  };

  const handleApprovalAction = async () => {
    if (!approvalComment && actionType === "REJECT")
      return alert("Please add a reason for rejection.");

    const updatedTask = {
      ...task,
      isApproved: actionType === "APPROVE",
      status: actionType === "APPROVE" ? "Done" : "In Progress",
    };
    setTask(updatedTask);
    setShowApprovalBox(false);
    setApprovalComment("");

    try {
      const endpoint = actionType === "APPROVE" ? "approve" : "disapprove";
      await api.put(`/tasks/${taskId}/${endpoint}`, {
        comment: approvalComment,
        adminName: user.fullName || user.firstName,
      });
    } catch (error) {
      console.error(error);
      alert("Action failed. Please refresh.");
    }
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

  // Render Activity Log Item
  const renderActivityItem = (act) => (
    <div
      key={act._id}
      className="flex gap-3 mb-4 animate-in fade-in slide-in-from-bottom-2"
    >
      <img
        src={act.userPhoto}
        className="w-8 h-8 rounded-full bg-neutral-800 object-cover mt-1"
        alt=""
      />
      <div className="flex-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-white">{act.userName}</span>
          <span className="text-[10px] text-neutral-500">
            {new Date(act.createdAt).toLocaleString()}
          </span>
        </div>

        {act.type === "COMMENT" && (
          <p className="text-sm text-neutral-300 bg-neutral-800/50 p-2 rounded-lg mt-1 border border-neutral-800">
            {act.content}
          </p>
        )}

        {act.type === "UPLOAD" && (
          <div className="mt-2">
            {act.metadata?.fileType === "IMAGE" ? (
              <a
                href={act.metadata.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="block w-fit"
              >
                <img
                  src={act.metadata.fileUrl}
                  alt={act.metadata.fileName}
                  className="max-w-[200px] rounded-lg border border-neutral-700 hover:opacity-90 transition-opacity"
                />
              </a>
            ) : (
              <a
                href={act.metadata?.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 bg-blue-900/20 text-blue-400 p-2 rounded-lg border border-blue-900/50 hover:bg-blue-900/30 transition-colors w-fit"
              >
                <FileText size={16} />
                <span className="text-sm underline">
                  {act.metadata?.fileName || "Attachment"}
                </span>
              </a>
            )}
          </div>
        )}

        {(act.type === "STATUS_CHANGE" || act.type === "PRIORITY_CHANGE") && (
          <p className="text-xs text-neutral-500 italic mt-0.5">
            {act.content}
          </p>
        )}

        {act.type === "APPROVAL" && (
          <div className="mt-1 p-2 bg-green-900/20 border border-green-900/50 rounded-lg text-sm text-green-400">
            ✅ Task Approved: {act.content}
          </div>
        )}
        {act.type === "REJECTION" && (
          <div className="mt-1 p-2 bg-red-900/20 border border-red-900/50 rounded-lg text-sm text-red-400">
            ❌ Task Returned: {act.content}
          </div>
        )}
      </div>
    </div>
  );

  if (loading) return <div className="p-8 text-neutral-400">Loading...</div>;

  // 👇 HUMOROUS ACCESS DENIED SCREEN
  if (error && (error.includes("Access Denied") || error.includes("403"))) {
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
          <button
            onClick={() => navigate(-1)}
            className="text-neutral-400 hover:text-white flex items-center gap-2"
          >
            <ArrowLeft size={18} /> Back
          </button>
          {isAdmin && (
            <button
              onClick={handleDeleteTask}
              className="flex items-center gap-2 text-red-500 hover:text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/10 transition-colors text-sm font-medium"
            >
              <Trash2 size={16} /> Delete Task
            </button>
          )}
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
          {/* LEFT COLUMN: Details & Attachments */}
          <div className="lg:col-span-2 space-y-6 overflow-y-auto pr-2 custom-scrollbar">
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
                      setTask({ ...task, title: e.target.value })
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
                      setTask({ ...task, description: e.target.value })
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
                  <div className="flex gap-3">
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
                        ? "Approve & Schedule Deletion"
                        : "Disapprove & Revert to In Progress"}
                    </p>
                    <textarea
                      value={approvalComment}
                      onChange={(e) => setApprovalComment(e.target.value)}
                      placeholder="Add a comment (optional)..."
                      className="w-full bg-neutral-900 border border-neutral-800 rounded-lg p-3 text-sm text-white focus:border-blue-600 outline-none resize-none"
                      rows={2}
                    />
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
                    <div className="flex gap-2">
                      <select
                        value={newLink.type}
                        onChange={(e) =>
                          setNewLink({ ...newLink, type: e.target.value })
                        }
                        className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none cursor-pointer"
                      >
                        <option value="DOC">Doc</option>
                        <option value="GITHUB">GitHub</option>
                        <option value="LINK">Link</option>
                      </select>
                      <button
                        onClick={handleAddLink}
                        disabled={!newLink.name || !newLink.url}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 rounded-lg text-sm font-medium transition-colors flex-1 disabled:opacity-50"
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

            {/* Activity Feed */}
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 flex flex-col h-[500px]">
              <h3 className="text-white font-bold mb-4 flex items-center gap-2 shrink-0">
                <MessageSquare size={18} /> Activity & Comments
              </h3>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar flex flex-col-reverse">
                {activities.length > 0 ? (
                  activities.map(renderActivityItem)
                ) : (
                  <div className="text-center text-neutral-600 py-10">
                    No activity yet.
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-neutral-800 shrink-0">
                <form
                  onSubmit={handlePostComment}
                  className="flex gap-3 items-end"
                >
                  <div className="flex-1 relative">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Write a comment..."
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-3 pr-3 py-3 text-sm text-white focus:border-blue-600 outline-none resize-none"
                      rows={1}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handlePostComment(e);
                        }
                      }}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    className="bg-blue-600 hover:bg-blue-500 text-white p-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send size={18} />
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Metadata */}
          <div className="space-y-6">
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
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default TaskDetails;
