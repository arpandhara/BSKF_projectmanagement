import React, { useEffect, Suspense, lazy } from "react";
import { Routes, Route } from "react-router-dom";
import {
  useAuth,
  useUser,
  ClerkLoaded,
  ClerkLoading,
} from "@clerk/clerk-react";
import { connectSocket, disconnectSocket } from "./services/socket";
import { setupInterceptors } from "./services/api";

// Components
import AuthLayout from "./components/layout/AuthLayout";

// 👇 OPTIMIZATION: Lazy Load Pages
const Dashboard = lazy(() => import("./pages/dashboard/Dashboard"));
const ProjectList = lazy(() => import("./pages/projects/ProjectList"));
const ProjectDetails = lazy(() => import("./pages/projects/ProjectDetails"));
const TeamList = lazy(() => import("./pages/team/TeamList"));
const Settings = lazy(() => import("./pages/settings/Settings"));
const LoginPage = lazy(() => import("./pages/auth/LoginPage"));
const SignUpPage = lazy(() => import("./pages/auth/SignUpPage"));

const MemberDetails = lazy(() => import("./pages/team/MemberDetails"));
const CreateOrganizationPage = lazy(() => import("./pages/organization/CreateOrganizationPage"));
const Notifications = lazy(() => import("./pages/notifications/Notifications"));
const TaskDetails = lazy(() => import("./pages/tasks/TaskDetails"));
const ProjectSettings = lazy(() => import("./pages/projects/ProjectSettings"));
const NotFound = lazy(() => import("./pages/NotFound"));

const App = () => {
  const { getToken } = useAuth();
  const { user } = useUser();

  // Setup API Interceptors
  useEffect(() => {
    setupInterceptors(getToken);
  }, [getToken]);

  // 2. SOCKET Connection
  useEffect(() => {
    if (user?.id) {
      const socket = connectSocket(user.id);

      socket.on("session:refresh", async () => {
        console.log("🔄 Session refresh requested. Reloading user data...");
        await user.reload();
      });

      return () => {
        socket.off("session:refresh");
        disconnectSocket();
      };
    }
  }, [user?.id]);

  // Reusable Loading Spinner
  const LoadingSpinner = () => (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-sm text-neutral-400">Loading...</p>
      </div>
    </div>
  );

  return (
    <>
      <ClerkLoading>
        <LoadingSpinner />
      </ClerkLoading>

      <ClerkLoaded>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/sign-up" element={<SignUpPage />} />

            <Route path="/" element={<AuthLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="projects" element={<ProjectList />} />
              <Route path="projects/:id" element={<ProjectDetails />} />
              <Route path="team" element={<TeamList />} />
              <Route path="settings" element={<Settings />} />

              <Route path="team/:userId" element={<MemberDetails />} />
              <Route
                path="create-organization"
                element={<CreateOrganizationPage />}
              />
              <Route path="notifications" element={<Notifications />} />
              <Route path="tasks/:taskId" element={<TaskDetails />} />
              <Route path="/projects/:id/settings" element={<ProjectSettings />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ClerkLoaded>
    </>
  );
};

export default App;