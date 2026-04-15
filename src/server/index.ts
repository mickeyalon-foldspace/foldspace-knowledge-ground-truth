import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { config } from "./config.js";
import agentsRouter from "./routes/agents.js";
import goldenSetsRouter from "./routes/goldenSets.js";
import runsRouter from "./routes/runs.js";
import resultsRouter from "./routes/results.js";

const app = express();

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));

// API routes
app.use("/api/agents", agentsRouter);
app.use("/api/golden-sets", goldenSetsRouter);
app.use("/api/runs", runsRouter);
app.use("/api/results", resultsRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

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
