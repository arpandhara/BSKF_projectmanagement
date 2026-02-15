import React, { useState, useRef } from "react";
import { X, Search, UserPlus, UserMinus, Shield, Loader2 } from "lucide-react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";

const ProjectMembersModal = ({ 
  isOpen, 
  onClose, 
  projectId, 
  currentMembers, 
  orgMembers = [], 
  loadingOrgMembers = false,
  onMemberToggled 
}) => {
  const [searchTerm, setSearchTerm] = useState("");


  const overlayRef = useRef(null);
  const modalRef = useRef(null);

  // Animation
  useGSAP(() => {
    if (isOpen) {
      gsap.fromTo(
        overlayRef.current,
        { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: "power2.out" }
      );
      gsap.fromTo(
        modalRef.current,
        { scale: 0.9, opacity: 0, y: 20 },
        { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: "back.out(1.2)" }
      );
    }
  }, [isOpen]);

  const isMemberInProject = (clerkId) => {
    return currentMembers.some((m) => m.clerkId === clerkId);
  };

  const handleToggleMember = async (member) => {
    const clerkId = member.publicUserData.userId;
    const isInProject = isMemberInProject(clerkId);

    if (isInProject && !window.confirm(`Are you sure you want to remove ${member.publicUserData.firstName} from this project?`)) {
      return;
    }

    if (onMemberToggled) {
      onMemberToggled(member);
    }
  };

  if (!isOpen) return null;

  // Filter members based on search
  const filteredMembers = orgMembers.filter((mem) => {
    const fullName = `${mem.publicUserData.firstName} ${mem.publicUserData.lastName}`.toLowerCase();
    const email = mem.publicUserData.identifier.toLowerCase();
    const search = searchTerm.toLowerCase();
    return fullName.includes(search) || email.includes(search);
  });

  return (
    <div 
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
    >
      <div 
        ref={modalRef}
        className="bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-neutral-800">
          <div>
            <h2 className="text-xl font-bold text-white">Manage Project Team</h2>
            <p className="text-neutral-400 text-sm mt-1">
              Add or remove members from this project
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white transition-colors p-2 hover:bg-neutral-800 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="p-4 border-b border-neutral-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" size={18} />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors"
            />
          </div>
        </div>

        {/* Members List */}
        <div className="flex-1 overflow-y-auto p-2">
          {loadingOrgMembers ? (
            <div className="flex flex-col items-center justify-center py-12 text-neutral-500 gap-3">
              <Loader2 className="animate-spin" size={24} />
              <p>Loading organization members...</p>
            </div>
          ) : filteredMembers.length > 0 ? (
            <div className="space-y-1">
              {filteredMembers.map((mem) => {
                const clerkId = mem.publicUserData.userId;
                const inProject = isMemberInProject(clerkId);
                const isAdmin = mem.role === "org:admin";

                return (
                  <div 
                    key={mem.id}
                    className={`flex items-center justify-between p-3 rounded-lg transition-colors ${
                      inProject ? "bg-blue-600/5 hover:bg-blue-600/10" : "hover:bg-neutral-800"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img 
                          src={mem.publicUserData.imageUrl} 
                          alt={mem.publicUserData.firstName}
                          className="w-10 h-10 rounded-full bg-neutral-800 object-cover border border-neutral-700" 
                        />
                        {inProject && (
                            <div className="absolute -bottom-1 -right-1 bg-blue-600 text-white rounded-full p-0.5 border-2 border-neutral-900">
                                <Shield size={10} fill="currentColor" />
                            </div>
                        )}
                      </div>
                      <div>
                        <h3 className="font-medium text-white flex items-center gap-2">
                          {mem.publicUserData.firstName} {mem.publicUserData.lastName}
                          {mem.publicUserData.userId === projectId.ownerId && (
                            <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded border border-yellow-500/30">OWNER</span>
                          )}
                          {isAdmin && (
                            <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1.5 py-0.5 rounded border border-purple-500/30">ADMIN</span>
                          )}
                        </h3>
                        <p className="text-sm text-neutral-400">{mem.publicUserData.identifier}</p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleToggleMember(mem)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        inProject
                          ? "bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white border border-red-500/20"
                          : "bg-blue-600 text-white hover:bg-blue-500 shadow-lg shadow-blue-900/20"
                      }`}
                    >
                      {inProject ? (
                        <>
                          <UserMinus size={14} /> Remove
                        </>
                      ) : (
                        <>
                          <UserPlus size={14} /> Add
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-neutral-500">
              <p>No members found matching "{searchTerm}"</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex justify-between items-center text-xs text-neutral-500">
          <span>{filteredMembers.length} members found</span>
          <span>
            {currentMembers.length} members in project
          </span>
        </div>
      </div>
    </div>
  );
};

export default ProjectMembersModal;
