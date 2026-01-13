import React, { useState, useEffect } from "react";
import { Search, UserPlus, Users, Shield, Mail } from "lucide-react";
import { useOrganization, useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import InviteMemberModal from "../../components/specific/InviteMemberModal";
import { getSocket } from "../../services/socket";
import PageTransition from "../../components/common/PageTransition";

const TeamList = () => {
  const { organization, isLoaded } = useOrganization();
  const { user } = useUser();
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Local state to hold members, allowing manual refreshes via socket
  const [members, setMembers] = useState([]);

  // 1. Function to fetch members manually
  const fetchMembers = async () => {
    if (!organization) return;
    setLoading(true);
    try {
      const res = await organization.getMemberships({ pageSize: 50 });
      setMembers(res.data);
    } catch (error) {
      console.error("Failed to load members", error);
    } finally {
      setLoading(false);
    }
  };

  // 2. Initial Data Load
  useEffect(() => {
    if (isLoaded) {
      if (organization) {
        fetchMembers();
      } else {
        setLoading(false);
      }
    }
  }, [isLoaded, organization]);

  // 3. Socket Listener
  useEffect(() => {
    const socket = getSocket();
    if (!socket || !organization) return;

    // Explicitly join the org room to ensure updates are received
    socket.emit("join_org", organization.id);

    const handleTeamUpdate = () => {
      console.log("🚀 Frontend: Team update received via socket. Refreshing list...");
      fetchMembers();
    };

    socket.on("team:update", handleTeamUpdate);

    return () => {
      socket.off("team:update", handleTeamUpdate);
    };
  }, [organization]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const isAdmin =
    members.find((mem) => mem.publicUserData.userId === user?.id)?.role ===
    "org:admin";

  const filteredMembers = members.filter((mem) => {
    const fullName =
      `${mem.publicUserData.firstName} ${mem.publicUserData.lastName}`.toLowerCase();
    const email = mem.publicUserData.identifier.toLowerCase();
    const search = debouncedSearch.toLowerCase(); // Use debounced value
    return fullName.includes(search) || email.includes(search);
  });

  if (loading)
    return <div className="p-8 text-neutral-400">Loading team...</div>;

  if (!organization) {
    return (
      <div className="p-8 text-center text-neutral-400">
        <h2 className="text-xl font-bold text-white mb-2">
          No Organization Selected
        </h2>
        <p>
          Please select or create an organization in the sidebar to view team
          members.
        </p>
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Team</h1>
            <p className="text-neutral-400 mt-1">
              Manage members of{" "}
              <span className="text-blue-400">{organization.name}</span>
            </p>
          </div>

          {isAdmin && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
            >
              <UserPlus size={16} /> Invite Member
            </button>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <TeamStat
            label="Total Members"
            value={members.length}
            icon={Users}
            color="text-blue-500"
            bg="bg-blue-500/10"
          />
          <TeamStat
            label="Pending Invites"
            value={organization.pendingInvitationsCount || 0}
            icon={Mail}
            color="text-orange-500"
            bg="bg-orange-500/10"
          />
          <TeamStat
            label="Admins"
            value={members.filter((m) => m.role === "org:admin").length}
            icon={Shield}
            color="text-purple-500"
            bg="bg-purple-500/10"
          />
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            size={18}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search team members..."
            className="w-full bg-neutral-900 border border-neutral-800 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-blue-600 text-white placeholder-neutral-500"
          />
        </div>

        {/* Team Table */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-4 p-4 border-b border-neutral-800 text-xs font-bold text-neutral-500 uppercase tracking-wider">
            <div className="col-span-4">Name</div>
            <div className="col-span-5">Email</div>
            <div className="col-span-3 text-right">Role</div>
          </div>

          {/* Table Body */}
          <div>
            {filteredMembers.map((mem) => (
              <div
                key={mem.id}
                onClick={() => navigate(`/team/${mem.publicUserData.userId}`)}
                className="grid grid-cols-12 gap-4 p-4 border-b border-neutral-800/50 hover:bg-neutral-800/50 transition-colors items-center text-sm last:border-0 cursor-pointer"
              >
                <div className="col-span-4 flex items-center gap-3">
                  <img
                    src={mem.publicUserData.imageUrl}
                    alt={mem.publicUserData.firstName}
                    className="w-8 h-8 rounded-full bg-neutral-800"
                  />
                  <span className="font-medium text-white">
                    {mem.publicUserData.firstName} {mem.publicUserData.lastName}
                    {mem.publicUserData.userId === user?.id && (
                      <span className="ml-2 text-xs text-neutral-500">
                        (You)
                      </span>
                    )}
                  </span>
                </div>
                <div className="col-span-5 text-neutral-400">
                  {mem.publicUserData.identifier}
                </div>
                <div className="col-span-3 text-right">
                  <span
                    className={`text-xs px-2 py-1 rounded font-bold uppercase ${
                      mem.role === "org:admin"
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-blue-500/20 text-blue-400"
                    }`}
                  >
                    {mem.role === "org:admin" ? "Admin" : "Member"}
                  </span>
                </div>
              </div>
            ))}
            {filteredMembers.length === 0 && (
              <div className="p-4 text-center text-neutral-500 text-sm">
                No members found matching your search.
              </div>
            )}
          </div>
        </div>

        <InviteMemberModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
        />
      </div>
    </PageTransition>
  );
};

const TeamStat = ({ label, value, icon: Icon, color, bg }) => (
  <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl flex justify-between items-center">
    <div>
      <p className="text-neutral-400 text-sm">{label}</p>
      <h3 className="text-3xl font-bold mt-1">{value}</h3>
    </div>
    <div className={`p-3 rounded-xl ${bg}`}>
      <Icon className={color} size={24} />
    </div>
  </div>
);

export default TeamList;