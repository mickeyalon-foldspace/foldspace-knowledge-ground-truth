import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { config } from "./config.js";
import { firebaseAuth, requireUser } from "./middleware/auth.js";
import authRouter from "./routes/auth.js";
import usersRouter from "./routes/users.js";
import invitesRouter from "./routes/invites.js";
import agentsRouter from "./routes/agents.js";
import goldenSetsRouter from "./routes/goldenSets.js";
import runsRouter from "./routes/runs.js";
import resultsRouter from "./routes/results.js";
import scoreProfilesRouter from "./routes/score-profiles.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

// Health check (public)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Auth routes — Firebase token required, but user record may not exist yet
app.use("/api/auth", firebaseAuth, authRouter);

// All other routes require Firebase auth + user record (org membership)
app.use("/api/agents", firebaseAuth, requireUser, agentsRouter);
app.use("/api/golden-sets", firebaseAuth, requireUser, goldenSetsRouter);
app.use("/api/runs", firebaseAuth, requireUser, runsRouter);
app.use("/api/results", firebaseAuth, requireUser, resultsRouter);
app.use("/api/users", firebaseAuth, requireUser, usersRouter);
app.use("/api/invites", firebaseAuth, requireUser, invitesRouter);
app.use("/api/score-profiles", firebaseAuth, requireUser, scoreProfilesRouter);

async function start() {
  try {
    await mongoose.connect(config.mongodb.uri);
    console.log("Connected to MongoDB");

    app.listen(config.server.port, () => {
      console.log(`API server running on http://localhost:${config.server.port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
