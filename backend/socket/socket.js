import { Server } from "socket.io";

let io;

const initializeSocket = (httpServer) => {
  io = new Server(httpServer, {
    pingTimeout: 60000,
    cors: {
      origin: true, // Allow dev connections
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    // console.log("🔌 Connected to socket:", socket.id);

    // 1. User Room
    socket.on("setup", (userData) => {
      if (userData?.userId) {
        socket.join(`user_${userData.userId}`);
        socket.emit("connected");
      }
    });

    // 2. Project Room
    socket.on("join_project", (room) => {
      socket.join(room);
    });

    // 3. ⭐ NEW: Organization Room (For project lists/team updates)
    socket.on("join_org", (orgId) => {
      if (orgId) {
        socket.join(`org_${orgId}`);
        console.log(`🔌 Socket ${socket.id} joined Org Room: org_${orgId}`);
      }
    });

    socket.on("leave_project", (room) => {
      socket.leave(room);
    });

    socket.on("disconnect", () => { });
  });

  return io;
};

export { initializeSocket, io };