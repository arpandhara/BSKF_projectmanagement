import React, { useState, useEffect, useRef } from "react";
import Modal from "../common/Modal";
import { Check, ChevronDown, X } from "lucide-react";
import api from "../../services/api";

const NewTaskModal = ({ isOpen, onClose, projectId, projectMembers = [], onTaskCreated }) => {
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    type: "TASK",
    priority: "MEDIUM",
    status: "To Do",
    dueDate: "",
    assignees: [] // Array of IDs
  });

  // Assignee Dropdown UI State
  const [isAssigneeDropdownOpen, setIsAssigneeDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Reset form on open
  useEffect(() => {
    if (isOpen) {
      setFormData({
        title: "",
        description: "",
        type: "TASK",
        priority: "MEDIUM",
        status: "To Do",
        dueDate: "",
        assignees: []
      });
      setIsAssigneeDropdownOpen(false);
    }
  }, [isOpen]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsAssigneeDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const toggleAssignee = (clerkId) => {
    setFormData(prev => {
      const exists = prev.assignees.includes(clerkId);
      if (exists) {
        return { ...prev, assignees: prev.assignees.filter(id => id !== clerkId) };
      } else {
        return { ...prev, assignees: [...prev.assignees, clerkId] };
      }
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title) return;

    setLoading(true);
    try {
      await api.post("/tasks", {
        ...formData,
        projectId: projectId,
        // Convert empty string date to null if not selected
        dueDate: formData.dueDate ? new Date(formData.dueDate) : undefined
      });

      window.dispatchEvent(new Event("taskUpdate"));

      if (onTaskCreated) onTaskCreated();
      onClose();
    } catch (error) {
      console.error("Task creation failed:", error);
      alert("Failed to create task.");
    } finally {
      setLoading(false);
    }
  };

  // Helper to get names for display
  const getSelectedNames = () => {
    if (formData.assignees.length === 0) return "Unassigned";
    return projectMembers
      .filter(m => formData.assignees.includes(m.clerkId))
      .map(m => m.firstName)
      .join(", ");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New Task">
      <form onSubmit={handleSubmit} className="space-y-4">
        
        {/* Title */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-300">Title</label>
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            placeholder="Task title"
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-600 transition-colors"
            required
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-300">Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Describe the task"
            rows={3}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-600 transition-colors resize-none"
          />
        </div>

        {/* Row 1: Type & Priority */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-300">Type</label>
            <select 
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600"
            >
              <option value="TASK">Task</option>
              <option value="BUG">Bug</option>
              <option value="IMPROVEMENT">Improvement</option>
              <option value="DESIGN">Design</option>
              <option value="CONTENT_WRITING">Content Writing</option>
              <option value="SOCIAL_MEDIA">Social Media Handling</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-300">Priority</label>
            <select 
              name="priority"
              value={formData.priority}
              onChange={handleChange}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600"
            >
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="LOW">Low</option>
            </select>
          </div>
        </div>

        {/* Row 2: Multiple Assignees & Status */}
        <div className="grid grid-cols-2 gap-4">
          {/* Custom Multi-Select for Assignees */}
          <div className="space-y-1 relative" ref={dropdownRef}>
            <label className="text-sm font-medium text-neutral-300">Assignees</label>
            <button
              type="button"
              onClick={() => setIsAssigneeDropdownOpen(!isAssigneeDropdownOpen)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-left text-white focus:outline-none focus:border-blue-600 flex justify-between items-center"
            >
              <span className="truncate block max-w-[140px]">{getSelectedNames()}</span>
              <ChevronDown size={14} className="text-neutral-500" />
            </button>

            {/* Dropdown Menu */}
            {isAssigneeDropdownOpen && (
              <div className="absolute z-10 w-full mt-1 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                {projectMembers.length > 0 ? (
                  projectMembers.map((member) => (
                    <div
                      key={member.clerkId}
                      onClick={() => toggleAssignee(member.clerkId)}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-neutral-800 cursor-pointer transition-colors"
                    >
                      <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                        formData.assignees.includes(member.clerkId) 
                          ? "bg-blue-600 border-blue-600" 
                          : "border-neutral-600"
                      }`}>
                        {formData.assignees.includes(member.clerkId) && <Check size={12} className="text-white" />}
                      </div>
                      <div className="flex items-center gap-2">
                        <img src={member.photo} className="w-5 h-5 rounded-full" alt="" />
                        <span className="text-sm text-white">{member.firstName} {member.lastName}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-neutral-500">No members in project</div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-neutral-300">Status</label>
            <select 
              name="status"
              value={formData.status}
              onChange={handleChange}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600"
            >
              <option value="To Do">To Do</option>
              <option value="In Progress">In Progress</option>
              <option value="Done">Done</option>
            </select>
          </div>
        </div>

        {/* Due Date */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-neutral-300">Due Date</label>
          <div className="relative">
            <input
              type="date"
              name="dueDate"
              value={formData.dueDate}
              onChange={handleChange}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-blue-600 transition-colors [&::-webkit-calendar-picker-indicator]:invert"
            />
          </div>
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
            {loading ? "Creating..." : "Create Task"}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default NewTaskModal;