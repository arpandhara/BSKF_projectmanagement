import { useEffect } from "react";
import { getSocket } from "../../services/socket";
import { useUser } from "@clerk/clerk-react";

const NotificationToastListener = () => {
  const { user } = useUser();

  useEffect(() => {
    const socket = getSocket();
    if (!socket || !user) return;

    const handleNewNotification = (note) => {
      // Don't show toast if I am the sender (shouldn't happen for mentions/assigns usually, but good safety)
      if (note.metadata?.senderId === user.id) return;

      let link = "/notifications"; // Default
      if (note.projectId) link = `/projects/${note.projectId}`;
      if (note.metadata?.taskId) link = `/tasks/${note.metadata.taskId}`;

      // Dispatch event for ToastContainer
      const event = new CustomEvent("show-toast", {
        detail: {
          message: note.message,
          link: link,
        },
      });
      window.dispatchEvent(event);
    };

    socket.on("notification:new", handleNewNotification);

    return () => {
      socket.off("notification:new", handleNewNotification);
    };
  }, [user]);

  return null; // This component doesn't render anything itself
};

export default NotificationToastListener;
