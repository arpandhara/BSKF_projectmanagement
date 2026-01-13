import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Save,
  Trash2,
  AlertTriangle,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import api from "../../services/api";
import { useAuth, useUser } from "@clerk/clerk-react";
import PageTransition from "../../components/common/PageTransition";

const ProjectSettings = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { orgRole } = useAuth();
  const { user } = useUser();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "ACTIVE",
  });

  // Check Admin Status
  const isAdmin =
    user?.publicMetadata?.role === "admin" || orgRole === "org:admin";

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const res = await api.get(`/projects/${id}`);
        setFormData({
          title: res.data.title,
          description: res.data.description || "",
          status: res.data.status || "ACTIVE",
        });
      } catch (error) {
        console.error("Failed to load project", error);
        alert("Failed to load project details.");
        navigate(`/projects/${id}`);
      } finally {
        setIsLoading(false);
      }
    };
    if (isAdmin) fetchProject();
    else setIsLoading(false);
  }, [id, navigate, isAdmin]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await api.put(`/projects/${id}`, formData);
      alert("Project updated successfully!");
    } catch (error) {
      console.error("Failed to update project", error);
      alert("Failed to update settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      window.confirm(
        "Are you sure you want to delete this project? This action cannot be undone and will delete all associated tasks."
      )
    ) {
      try {
        await api.delete(`/projects/${id}`);
        navigate("/projects");
      } catch (error) {
        console.error("Failed to delete project", error);
        alert("Failed to delete project. You might not have permission.");
      }
    }
  };

  // 👇 Access Denied View
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center space-y-4">
        <div className="bg-red-500/10 p-4 rounded-full">
          <ShieldAlert size={48} className="text-red-500" />
        </div>
        <h2 className="text-2xl font-bold text-white">Access Restricted</h2>
        <p className="text-neutral-400 max-w-md">
          Only administrators can modify project settings or delete projects.
          Please contact your organization admin.
        </p>
        <button
          onClick={() => navigate(`/projects/${id}`)}
          className="px-6 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg transition-colors border border-neutral-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-neutral-400">
        <Loader2 className="animate-spin mr-2" /> Loading settings...
      </div>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate(`/projects/${id}`)}
            className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold">Project Settings</h1>
        </div>

        {/* General Settings Form */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-4 text-white">
            General Information
          </h2>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                Project Name
              </label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                Description
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows="4"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Status
                </label>
                <select
                  name="status"
                  value={formData.status}
                  onChange={handleChange}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-blue-600 transition-all"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="ON_HOLD">On Hold</option>
                  <option value="ARCHIVED">Archived</option>
                </select>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={isSaving}
                className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg font-medium flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <Save size={18} />
                )}
                Save Changes
              </button>
            </div>
          </form>
        </div>

        {/* Danger Zone */}
        <div className="border border-red-900/30 bg-red-900/10 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-red-500/10 rounded-lg text-red-500">
              <AlertTriangle size={24} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-red-500 mb-1">
                Danger Zone
              </h3>
              <p className="text-neutral-400 text-sm mb-6">
                Deleting this project is irreversible. It will permanently
                remove all tasks, comments, and associated data.
              </p>
              <button
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
              >
                <Trash2 size={16} /> Delete Project
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageTransition>
  );
};

export default ProjectSettings;
