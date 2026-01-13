import React, { useState, useEffect } from "react";
import { UserProfile, useUser, useOrganization } from "@clerk/clerk-react";
import { Building2, User, Upload, Trash2, AlertTriangle } from "lucide-react";
import api from "../../services/api";
import PageTransition from "../../components/common/PageTransition";

const Settings = () => {
  const { user } = useUser();
  const { organization, isLoaded } = useOrganization();
  const [activeTab, setActiveTab] = useState("profile");

  // Form State
  const [orgName, setOrgName] = useState("");
  const [logoFile, setLogoFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (organization) {
      setOrgName(organization.name);
      setPreviewUrl(organization.imageUrl);
    }
  }, [organization]);

  // Permission Check
  const isGlobalAdmin = user?.publicMetadata?.role === "admin";
  const isOrgAdmin = organization?.membership?.role === "org:admin";
  const canManageWorkspace = organization && (isGlobalAdmin || isOrgAdmin);

  const handleLogoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setLogoFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSave = async () => {
    if (!organization) return;

    setIsSaving(true);
    try {
      const promises = [];
      if (orgName && orgName !== organization.name) {
        promises.push(organization.update({ name: orgName }));
      }
      if (logoFile) {
        promises.push(organization.setLogo({ file: logoFile }));
      }

      if (promises.length > 0) {
        await Promise.all(promises);
        alert("Workspace settings updated successfully!");
        window.location.reload();
      } else {
        alert("No changes to save.");
      }
    } catch (error) {
      console.error("Update failed:", error);
      alert(error.errors?.[0]?.message || "Failed to update settings.");
    } finally {
      setIsSaving(false);
    }
  };

  // 👇 UPDATED: Smart Delete Logic
  const handleDeleteOrganization = async () => {
    if (!organization) return;

    const confirmMessage = `Are you sure you want to delete "${organization.name}"? This action is permanent and cannot be undone.`;
    if (!window.confirm(confirmMessage)) return;

    const verification = window.prompt(
      `Please type "${organization.name}" to confirm deletion:`
    );
    if (verification !== organization.name) {
      alert("Organization name did not match. Deletion cancelled.");
      return;
    }

    setIsDeleting(true);
    try {
      // 1. Check how many admins exist
      const adminMemberships = await organization.getMemberships({
        role: ["org:admin"],
        pageSize: 5, // We just need to know if it's > 1
      });

      const adminCount = adminMemberships.total_count;

      console.log("DEBUG: Admin Count:", adminCount);

      // 2. Decision Logic
      if (adminCount > 1) {
        // Case A: Multiple Admins -> Must Request Approval
        await api.post("/admin-actions/delete-org/request", {
          orgId: organization.id,
        });
        alert(
          "Deletion request sent! Since there are other admins, one of them must approve this action in the Notifications page."
        );
      } else {
        // Case B: Single Admin (Just you) -> Delete Immediately
        await organization.destroy();
        alert("Organization deleted successfully.");
        window.location.href = "/"; // Redirect to home
      }
    } catch (error) {
      console.error("Delete/Request failed:", error);
      // Handle both Axios errors (backend) and Clerk errors
      const msg =
        error.response?.data?.message ||
        error.errors?.[0]?.message ||
        "Failed to process deletion.";
      alert(msg);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isLoaded)
    return <div className="p-8 text-neutral-400">Loading settings...</div>;

  return (
    <PageTransition>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-neutral-400 mt-1">
            Manage your account and workspace preferences
          </p>
        </div>

        {/* Tabs */}
        <div className="border-b border-neutral-800 flex gap-6 text-sm">
          <button
            onClick={() => setActiveTab("profile")}
            className={`flex items-center gap-2 pb-3 border-b-2 transition-colors ${
              activeTab === "profile"
                ? "border-blue-600 text-white"
                : "border-transparent text-neutral-400 hover:text-neutral-200"
            }`}
          >
            <User size={16} />
            My Profile
          </button>

          {canManageWorkspace && (
            <button
              onClick={() => setActiveTab("workspace")}
              className={`flex items-center gap-2 pb-3 border-b-2 transition-colors ${
                activeTab === "workspace"
                  ? "border-blue-600 text-white"
                  : "border-transparent text-neutral-400 hover:text-neutral-200"
              }`}
            >
              <Building2 size={16} />
              Workspace
            </button>
          )}
        </div>

        {/* Content */}
        <div className="mt-6">
          {activeTab === "profile" ? (
            <div className="w-full">
              <UserProfile
                appearance={{
                  variables: {
                    colorPrimary: "#2563eb",
                    colorBackground: "#171717",
                    colorText: "white",
                    colorInputBackground: "#0a0a0a",
                    colorInputText: "white",
                  },
                  elements: {
                    card: "bg-neutral-900 border border-neutral-800 shadow-none w-full max-w-4xl",
                    navbar: "border-r border-neutral-800",
                    navbarButton: "text-neutral-400 hover:text-white",
                    headerTitle: "text-white",
                    headerSubtitle: "text-neutral-400",
                    pageScrollBox: "bg-neutral-900",
                    formButtonPrimary: "bg-blue-600 hover:bg-blue-500",
                    organizationListPreviewItemActionButton: "!hidden",
                  },
                }}
              />
            </div>
          ) : (
            canManageWorkspace && (
              <div className="max-w-2xl space-y-8">
                {/* General Info Card */}
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 space-y-6">
                  <h2 className="text-lg font-semibold">General Information</h2>

                  {/* Logo Upload Section */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-neutral-300">
                      Workspace Logo
                    </label>
                    <div className="flex items-center gap-6">
                      <div className="w-20 h-20 bg-neutral-950 border border-neutral-800 rounded-lg flex items-center justify-center overflow-hidden">
                        {previewUrl ? (
                          <img
                            src={previewUrl}
                            alt="Logo Preview"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="text-2xl font-bold text-neutral-600">
                            {orgName?.charAt(0) || "W"}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2">
                        <div className="flex gap-3">
                          <label className="cursor-pointer bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-lg text-sm font-medium border border-neutral-700 transition-colors flex items-center gap-2">
                            <Upload size={16} />
                            Upload Logo
                            <input
                              type="file"
                              className="hidden"
                              accept="image/*"
                              onChange={handleLogoChange}
                            />
                          </label>
                        </div>
                        <p className="text-xs text-neutral-500">
                          Recommended size: 256x256px. Max file size: 5MB.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Workspace Name */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-neutral-300">
                      Workspace Name
                    </label>
                    <input
                      type="text"
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-600 transition-colors"
                    />
                  </div>

                  <div className="pt-4 flex justify-end">
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>

                {/* Danger Zone Card */}
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-6 space-y-4">
                  <div className="flex items-center gap-3 text-red-500">
                    <AlertTriangle size={20} />
                    <h2 className="text-lg font-semibold">Danger Zone</h2>
                  </div>

                  <p className="text-sm text-neutral-400">
                    Deleting an organization is permanent and cannot be undone.
                    All projects and data associated with this organization will
                    be lost.
                  </p>

                  <div className="flex justify-end pt-2">
                    <button
                      onClick={handleDeleteOrganization}
                      disabled={isDeleting}
                      className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {isDeleting ? (
                        "Processing..."
                      ) : (
                        <>
                          <Trash2 size={16} /> Delete Organization
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </PageTransition>
  );
};

export default Settings;
