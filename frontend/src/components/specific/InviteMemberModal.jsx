import React, { useState, useEffect } from "react";
import { useOrganization } from "@clerk/clerk-react"; // 1. Import Hook
import Modal from "../common/Modal";

const InviteMemberModal = ({ isOpen, onClose }) => {
  const { organization, isLoaded } = useOrganization(); // 2. Get active Org
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("org:member"); // Clerk roles are 'org:admin' or 'org:member'
  const [loading, setLoading] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setEmail("");
      setRole("org:member");
    }
  }, [isOpen]);

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!isLoaded || !organization) return;

    setLoading(true);
    try {
      // 3. Send Invitation via Clerk
      await organization.inviteMember({
        emailAddress: email,
        role: role,
      });
      
      alert(`Invitation sent to ${email}`);
      onClose();
    } catch (error) {
      console.error("Invite error:", error);
      // Clerk errors are usually arrays
      const msg = error.errors ? error.errors[0].message : "Failed to invite";
      alert(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Invite Team Member">
      <div className="mb-6">
         <p className="text-sm text-neutral-400">
           Inviting to: <span className="text-white font-medium">{organization?.name || "Organization"}</span>
         </p>
      </div>
      <form onSubmit={handleInvite} className="space-y-4">
        {/* Email Address */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-300">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter email address"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-600 transition-colors"
            required
          />
        </div>

        {/* Role */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-300">Role</label>
          <select 
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600"
          >
            <option value="org:member">Member</option>
            <option value="org:admin">Admin</option>
          </select>
        </div>

        {/* Footer Buttons */}
        <div className="flex justify-end gap-3 pt-4 border-t border-neutral-800 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Invitation"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default InviteMemberModal;