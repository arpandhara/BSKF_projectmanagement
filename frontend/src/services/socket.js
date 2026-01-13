import { io } from "socket.io-client";

let socket;

export const connectSocket = (userId) => {
  if (!socket) {
    socket = io("http://localhost:5000", {
      withCredentials: true,
      transports: ["websocket"], // Force WebSocket to avoid polling CORS issues
      reconnectionAttempts: 5,
    });
  }

  if (socket) {
    // 1. Join user room immediately if connected
    if (socket.connected && userId) {
      socket.emit("setup", { userId });
    }

    // 2. Listen for connect event to join (handles first load & reconnects)
    socket.on("connect", () => {
    //   console.log("✅ Socket Connected (ID:", socket.id, ")");
      if (userId) socket.emit("setup", { userId });
    });

    socket.on("connect_error", (err) => {
      console.error("❌ Socket Error:", err.message);
    });
  }

  return socket;
};

export const getSocket = () => {
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};