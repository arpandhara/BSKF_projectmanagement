import express from "express";
import dotenv from "dotenv";
import { createServer } from "http"; 
import { initializeSocket } from "./socket/socket.js"; // Import socket init

await dotenv.config();
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";

// Import Routes
import connectDB from "./config/db.js";
import errorHandler from "./middleware/errorMiddleware.js";
import projectRoutes from "./routes/projectRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import adminActionRoutes from "./routes/adminActionRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import { deleteExpiredTasks } from "./controllers/taskController.js";

await connectDB();

const app = express();
const httpServer = createServer(app); 


const io = initializeSocket(httpServer);


app.set("io", io);

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true
}));
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf.toString();
    },
  })
);

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5000,
});
app.use(limiter);

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
setInterval(() => {
  console.log("⏰ Running task cleanup...");
  deleteExpiredTasks(io);
}, TWENTY_FOUR_HOURS);

// Routes
app.use("/api/projects", projectRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/api/webhooks", webhookRoutes);
app.use("/api/users", userRoutes);
app.use('/api/admin-actions', adminActionRoutes);
app.use("/api/notifications", notificationRoutes);

app.get("/", (req, res) => {
  res.send("API is running...");
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;


httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});