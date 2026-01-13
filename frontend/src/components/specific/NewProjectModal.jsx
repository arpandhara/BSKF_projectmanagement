import React, { useState } from "react";
import { useAuth } from "@clerk/clerk-react";
import Modal from "../common/Modal";
import api from "../../services/api";

const NewProjectModal = ({ isOpen, onClose, onProjectCreated }) => {
  const { orgId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    priority: "LOW", // Default value
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title) return;

    setLoading(true);
    try {
      await api.post("/projects", {
        ...formData,
        orgId : orgId
      });

      window.dispatchEvent(new Event("projectUpdate"));

      if (onProjectCreated) onProjectCreated();
      onClose();
      setFormData({ title: "", description: "", priority: "MEDIUM" });
    } catch (error) {
      console.error("Error creating project:", error);
      alert("Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Project">
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Project Name */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-300">Project Name</label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({...formData, title: e.target.value})}
            placeholder="e.g. Website Redesign"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-600 transition-colors"
            required
          />
        </div>

        {/* Priority Dropdown (New) */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-300">Priority</label>
          <select
            value={formData.priority}
            onChange={(e) => setFormData({...formData, priority: e.target.value})}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors"
          >
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-300">Description</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({...formData, description: e.target.value})}
            placeholder="What is this project about?"
            rows={3}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-600 transition-colors resize-none"
          />
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
            {loading ? "Creating..." : "Create Project"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default NewProjectModal;