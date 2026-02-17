import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useClerk } from "@clerk/clerk-react";
import {
  ArrowLeft,
  Send,
  Plus,
  Paperclip,
  MoreVertical,
  Check,
  CheckCheck,
  FileText,
  X,
  Upload,
  Image as ImageIcon,
} from "lucide-react";
import api from "../../services/api";
import { getSocket } from "../../services/socket";
import { uploadFile } from "../../services/supabase";
import toast from "react-hot-toast";

const TaskChatPage = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { user } = useClerk();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const [messageText, setMessageText] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // Mention State
  const [showMentions, setShowMentions] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [cursorPos, setCursorPos] = useState(0);



  // 1. Fetch Task Details
  const { data: task, isLoading: loadingTask } = useQuery({
    queryKey: ["task", taskId],
    queryFn: async () => {
      const res = await api.get(`/tasks/${taskId}`);
      return res.data;
    },
    staleTime: 1000 * 30, // Cache for 30s
  });

  // 2. Fetch Activities (Messages)
  const { data: activities = [] } = useQuery({
    queryKey: ["task-activities", taskId],
    queryFn: async () => {
      const res = await api.get(`/tasks/${taskId}/activity`);
      return res.data;
    },
    staleTime: 1000 * 60,
  });

  // Derive Taggable Users (Assignees + Admin - Self)
  const taggableUsers = (() => {
    if (!task) return [];
    const list = [...(task.assigneeDetails || [])];
    // Add owner if not already in list
    if (task.ownerDetails && !list.some((u) => u.clerkId === task.ownerDetails.clerkId)) {
      list.push(task.ownerDetails);
    }
    // return list.filter((u) => u.clerkId !== user?.id);
    return list; // Allow self-tagging for debug
  })();

  const filteredUsers = taggableUsers.filter((u) =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(mentionQuery.toLowerCase())
  );

  // Debugging Mention Logic
  useEffect(() => {
    console.log("DEBUG: taggableUsers:", taggableUsers);
    console.log("DEBUG: filteredUsers:", filteredUsers);
    console.log("DEBUG: showMentions:", showMentions);
    console.log("DEBUG: mentionQuery:", mentionQuery);
  }, [taggableUsers, filteredUsers, showMentions, mentionQuery]);

  // Scroll to bottom
  const scrollToBottom = (behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    scrollToBottom();
  }, [activities]);

  // Mark as read on mount and unmount
  useEffect(() => {
    if (!taskId) return;
    const markRead = () => api.post(`/tasks/${taskId}/read`);
    markRead();
    return () => {
      markRead();
      queryClient.invalidateQueries(["task", taskId]);
    }
  }, [taskId, queryClient]);

  // Socket Setup
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !task) return;

    socket.emit("join_project", `project_${task.projectId._id || task.projectId}`);

    const handleNewActivity = (newActivity) => {
      if (newActivity.userId === user?.id) return;
      if (newActivity.taskId === taskId) {
        queryClient.setQueryData(["task-activities", taskId], (old) => {
          if (old && old.some((a) => a._id === newActivity._id)) return old;
          return [newActivity, ...(old || [])];
        });
      }
    };

    socket.on("task:activity", handleNewActivity);
    return () => {
      socket.off("task:activity", handleNewActivity);
    };
  }, [taskId, task, queryClient, user?.id]);

  // Mutations
  const postActivityMutation = useMutation({
    mutationFn: async (activity) => {
      await api.post(`/tasks/${taskId}/activity`, activity);
    },
    onMutate: async (newActivity) => {
      await queryClient.cancelQueries(["task-activities", taskId]);
      const previousActivities = queryClient.getQueryData(["task-activities", taskId]);

      const tempActivity = {
        _id: `temp-${Date.now()}`,
        type: newActivity.type,
        content: newActivity.content,
        userName: user.fullName || user.firstName,
        userPhoto: user.imageUrl,
        userId: user.id,
        createdAt: new Date().toISOString(),
        metadata: newActivity.metadata,
      };

      queryClient.setQueryData(["task-activities", taskId], (old) => [
        tempActivity,
        ...(old || []),
      ]);

      return { previousActivities };
    },
    onError: (err, newActivity, context) => {
      queryClient.setQueryData(
        ["task-activities", taskId],
        context.previousActivities
      );
      toast.error("Failed to send message");
    },
    onSettled: () => {
      queryClient.invalidateQueries(["task-activities", taskId]);
    },
  });

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!messageText.trim()) return;

    // Detect Mentions
    const mentions = [];
    taggableUsers.forEach((u) => {
      const name = `${u.firstName} ${u.lastName}`;
      if (messageText.toLowerCase().includes(`@${name.toLowerCase()}`)) {
        mentions.push(u.clerkId);
      }
    });

    postActivityMutation.mutate({
      type: "COMMENT",
      content: messageText,
      mentions,
    });
    setMessageText("");
  };

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    const newCursorPos = e.target.selectionStart;
    setMessageText(newValue);
    setCursorPos(newCursorPos);

    // Check for active mention
    // We look for the last '@' before cursor
    const lastAt = newValue.lastIndexOf("@", newCursorPos - 1);
    if (lastAt !== -1) {
      const query = newValue.slice(lastAt + 1, newCursorPos);
      console.log("DEBUG: Detected potential mention. Query:", query);
      // Only trigger if no spaces in query (simple name search)
      // ALLOW SPACES for full names like "John Doe"
      if (query.length >= 0) { 
        setShowMentions(true);
        setMentionQuery(query);
        return;
      }
    }
    setShowMentions(false);
  };

  const insertMention = (userToTag) => {
    const lastAt = messageText.lastIndexOf("@", cursorPos - 1);
    if (lastAt !== -1) {
      const before = messageText.slice(0, lastAt);
      const after = messageText.slice(cursorPos);
      const fullName = `${userToTag.firstName} ${userToTag.lastName}`;
      const newValue = `${before}@${fullName} ${after}`;
      
      setMessageText(newValue);
      setShowMentions(false);
      
      // Reset focus (optional, but good for UX)
      if(fileInputRef.current?.parentElement?.querySelector('textarea')) {
          fileInputRef.current.parentElement.querySelector('textarea').focus();
      }
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    const toastId = toast.loading("Uploading file...");

    try {
      const { url, error } = await uploadFile(file);
      if (error) throw error;

      postActivityMutation.mutate({
        type: "UPLOAD",
        content: "Shared a file",
        metadata: {
          fileName: file.name,
          fileUrl: url,
          fileType: file.type.startsWith("image/") ? "IMAGE" : "DOC",
        },
      });
      toast.success("File sent", { id: toastId });
    } catch (error) {
      console.error("Upload failed:", error);
      toast.error("Failed to upload file", { id: toastId });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // --- Render Helpers ---

  const formatTime = (dateString) => {
    return new Date(dateString).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatDateHeader = (dateString) => {
     const date = new Date(dateString);
     const today = new Date();
     const yesterday = new Date(today);
     yesterday.setDate(yesterday.getDate() - 1);

     if (date.toDateString() === today.toDateString()) return "Today";
     if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
     return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
  };

  // Group messages by date
  const groupedActivities = [...activities].reverse().reduce((groups, activity) => {
     const date = new Date(activity.createdAt).toDateString();
     if (!groups[date]) groups[date] = [];
     groups[date].push(activity);
     return groups;
  }, {});


  if (loadingTask)
    return (
      <div className="h-full flex items-center justify-center bg-[#111b21] relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.06] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]"></div>
        <div className="flex flex-col items-center gap-4 z-10">
           <div className="w-8 h-8 border-4 border-[#00a884] border-t-transparent rounded-full animate-spin"></div>
           <div className="text-[#8696a0] font-medium">Loading chat...</div>
        </div>
      </div>
    );

  return (
    <div className="fixed inset-0 z-[100] md:static md:z-auto flex flex-col h-[100dvh] bg-[#0b141a] overscroll-none touch-pan-x">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')]">
      </div>

      {/* Header */}
      <div className="bg-[#202c33] px-3 py-3 flex items-center gap-3 border-b border-[#2f3b43] z-20 shrink-0 shadow-sm safe-top">
        <button
          onClick={() => navigate(-1)}
          className="text-[#d1d7db] hover:bg-[#374248] p-2 rounded-full transition-colors -ml-1"
        >
          <ArrowLeft size={22} />
        </button>
        
        <div className="flex items-center gap-3 flex-1 min-w-0">
           <div className="w-10 h-10 rounded-full bg-[#6a7175] flex items-center justify-center text-white font-bold shrink-0 text-lg">
              {task?.title?.charAt(0).toUpperCase()}
           </div>
           <div className="flex-1 min-w-0">
             <h1 className="text-[#e9edef] font-medium truncate text-base leading-snug">{task?.title}</h1>
             <p className="text-xs text-[#8696a0] truncate">
               {task?.assignees?.map((a) => a.fullName).join(", ")}
             </p>
           </div>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 space-y-4 custom-scrollbar z-10 scroll-smooth">
        {Object.entries(groupedActivities).map(([date, msgs]) => (
           <div key={date} className="space-y-1">
              {/* Date Header */}
              <div className="flex justify-center mb-4 sticky top-2 z-10">
                 <span className="bg-[#1f2c33] text-[#8696a0] text-[11px] font-medium px-4 py-1.5 rounded-lg shadow-sm border border-[#2f3b43]/50 backdrop-blur-sm opacity-90">
                    {formatDateHeader(date)}
                 </span>
              </div>

              {msgs.map((msg, idx) => {
                 const isMe = msg.userId === user?.id;
                 const isSystem = ["STATUS_CHANGE", "PRIORITY_CHANGE", "APPROVAL", "REJECTION"].includes(msg.type);

                 if (isSystem) {
                    return (
                       <div key={msg._id || idx} className="flex justify-center my-3">
                          <span className="bg-[#1f2c33]/80 text-[#8696a0] text-xs px-3 py-1 rounded-lg border border-[#2f3b43] text-center max-w-[90%]">
                             {msg.content}
                          </span>
                       </div>
                    )
                 }

                 return (
                    <div
                       key={msg._id || idx}
                       className={`flex mb-1 items-end group ${isMe ? "justify-end" : "justify-start"}`}
                    >
                       {!isMe && (
                          <div className="w-7 h-7 mr-2 mb-1 flex-shrink-0">
                             <img 
                                src={msg.userPhoto || "https://github.com/shadcn.png"} 
                                alt={msg.userName}
                                title={msg.userName}
                                className="w-full h-full rounded-full object-cover border border-[#2f3b43] shadow-sm"
                             />
                          </div>
                       )}

                       <div
                          className={`
                             relative max-w-[85%] sm:max-w-[70%] px-2.5 py-1.5 shadow-[0_1px_0.5px_rgba(11,20,26,0.13)]
                             ${isMe 
                                ? "bg-[#005c4b] text-[#e9edef] rounded-xl rounded-tr-none" 
                                : "bg-[#202c33] text-[#e9edef] rounded-xl rounded-tl-none"}
                          `}
                       >
                          {/* Triangle for bubbles - Hidden on mobile for simpler look or kept? Kept for WhatsApp feel */}
                          {isMe ? (
                             <span className="absolute top-0 -right-2 w-0 h-0 border-t-[10px] border-t-[#005c4b] border-r-[10px] border-r-transparent rotate-90" />
                          ) : (
                             <span className="absolute top-0 -left-2 w-0 h-0 border-t-[10px] border-t-[#202c33] border-l-[10px] border-l-transparent -rotate-90" />
                          )}

                          {/* Sender Name (only for others) */}
                          {!isMe && (
                             <span className="text-[12px] font-medium text-[#f5c345] mb-0.5 block px-0.5">
                                {msg.userName}
                             </span>
                          )}

                          {/* Content */}
                          <div className={`px-0.5 ${msg.type === "UPLOAD" ? "pb-1" : ""}`}>
                             {msg.type === "UPLOAD" && (
                             <div className="mb-1">
                                {msg.metadata?.fileType === "IMAGE" ? (
                                   <a href={msg.metadata.fileUrl} target="_blank" rel="noreferrer" className="block relative">
                                      <img
                                      src={msg.metadata.fileUrl}
                                      alt={msg.metadata.fileName}
                                      className="rounded-lg w-full max-h-64 object-cover border border-black/10"
                                      />
                                   </a>
                                ) : (
                                   <a
                                      href={msg.metadata?.fileUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="flex items-center gap-3 bg-black/20 p-2.5 rounded-md hover:bg-black/30 transition-colors border border-white/5"
                                   >
                                      <div className="bg-[#2a3942] p-2 rounded text-[#8696a0]">
                                       <FileText size={20} />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium truncate text-white/90">{msg.metadata?.fileName}</p>
                                      <p className="text-[10px] text-[#8696a0] uppercase tracking-wider">{msg.metadata?.fileType || "DOC"}</p>
                                      </div>
                                   </a>
                                )}
                                {msg.content !== "Shared a file" && (
                                   <p className="mt-2 text-[15px] whitespace-pre-wrap">{msg.content}</p>
                                )}
                             </div>
                             )}

                             {msg.type === "COMMENT" && (
                             <p className="text-[15px] leading-snug whitespace-pre-wrap break-words">
                                {msg.content}
                             </p>
                             )}
                          </div>

                          {/* Meta (Time + Status) */}
                          <div className={`flex items-center justify-end gap-1 mt-1 select-none ${isMe ? "text-[#87b4ac]" : "text-[#8696a0]"}`}>
                             <span className="text-[10px] min-w-fit font-medium">
                             {formatTime(msg.createdAt)}
                             </span>
                             {isMe && <CheckCheck size={14} className={idx === msgs.length - 1 ? "text-[#53bdeb]" : ""} />}
                          </div>
                       </div>
                    </div>
                 );
              })}
           </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="bg-[#202c33] px-2 py-2 flex items-end gap-2 z-20 shrink-0 select-none pb-safe relative">
        {/* Mention Popup */}
        {showMentions && (
          <div className="absolute bottom-full left-2 mb-2 w-64 bg-[#233138] rounded-lg shadow-xl z-50 overflow-hidden border border-[#233138]">
             <div className="bg-[#111b21] px-3 py-2 text-xs font-medium text-[#8696a0] uppercase tracking-wider">
                Mention Member
             </div>
             <div className="max-h-48 overflow-y-auto custom-scrollbar">
               {filteredUsers.length > 0 ? (
                 filteredUsers.map(u => (
                   <button
                     key={u.clerkId}
                     onClick={() => insertMention(u)}
                     className="w-full flex items-center gap-3 px-4 py-2 hover:bg-[#111b21] transition-colors text-left"
                   >
                      <img 
                        src={u.photo || "https://github.com/shadcn.png"} 
                        className="w-8 h-8 rounded-full object-cover"
                        alt={u.firstName}
                      />
                      <div>
                         <p className="text-[#e9edef] text-sm font-medium">{u.firstName} {u.lastName}</p>
                         <p className="text-[#8696a0] text-xs">@{u.firstName.toLowerCase()}</p>
                      </div>
                   </button>
                 ))
               ) : (
                 <div className="px-4 py-3 text-[#8696a0] text-sm text-center">
                   No members found
                 </div>
               )}
             </div>
          </div>
        )}

        {/* Input Container */}
        <div className="flex-1 bg-[#2a3942] rounded-2xl flex items-end border-none outline-none ring-0 focus-within:ring-0 focus-within:outline-none focus-within:border-none transition-colors py-1">
          {/* File Actions (Visible inside or outside? Inside saves vertical space) */}
          <div className="flex items-end pl-1 pb-1">
              <button
                 onClick={() => fileInputRef.current?.click()}
                 className="p-2 text-[#8696a0] hover:text-[#cfd4d8] transition-colors rounded-full hover:bg-[#374248]"
              >
                  {isUploading ? (
                     <div className="w-5 h-5 border-2 border-[#8696a0] border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                     <Plus size={20} className="stroke-2" />
                  )}
               </button>
               {/* Hidden file input */}
               <input
                   type="file"
                   ref={fileInputRef}
                   className="hidden"
                   onChange={handleFileUpload}
               />
          </div>

          <textarea
            value={messageText}
            onChange={handleInputChange}
            placeholder="Message"
            className="flex-1 bg-transparent border-none outline-none focus:outline-none focus:ring-0 focus:border-none text-[#d1d7db] placeholder-[#8696a0] px-2 py-2.5 max-h-32 resize-none custom-scrollbar text-[16px] leading-relaxed"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage(e);
              }
            }}
            onClick={(e) => setCursorPos(e.target.selectionStart)}
          />
        </div>

        {/* Send Button */}
        <button
          onClick={messageText.trim() ? (e) => handleSendMessage(e) : undefined}
          className={`p-3 rounded-full transition-all duration-200 shadow-md mb-0.5 flex items-center justify-center shrink-0
             ${messageText.trim() 
                ? "bg-[#00a884] text-white hover:bg-[#008f6f] cursor-pointer" 
                : "bg-[#374248] text-[#8696a0] cursor-default"}
          `}
        >
          {messageText.trim() ? <Send size={20} className="ml-0.5" /> : <div className="w-5 h-5" />} {/* Placeholder to keep size */}
        </button>
      </div>
    </div>
  );
};

export default TaskChatPage;
