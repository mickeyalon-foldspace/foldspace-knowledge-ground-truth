import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { EvaluationRun } from "../models/EvaluationRun.js";
import { EvaluationResult } from "../models/EvaluationResult.js";
import { ScoreProfile } from "../models/ScoreProfile.js";
import { evaluationRunner, runnerEvents } from "../services/runner.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const runs = await EvaluationRun.find({ orgId: req.user!.orgId }).sort({
      createdAt: -1,
    });
    res.json(runs);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch runs" });
  }
});

router.post(
  "/bulk-delete",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { ids } = req.body as { ids: string[] };
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        res.status(400).json({ error: "ids array is required" });
        return;
      }

      const validIds = ids.filter(isValidObjectId);
      if (validIds.length === 0) {
        res.status(400).json({ error: "No valid IDs provided" });
        return;
      }

      const orgId = req.user!.orgId;
      const objectIds = validIds.map((id) => new mongoose.Types.ObjectId(id));

      const resultDel = await EvaluationResult.deleteMany({
        runId: { $in: objectIds },
        orgId,
      });
      const runDel = await EvaluationRun.deleteMany({
        _id: { $in: objectIds },
        orgId,
      });

      res.json({
        message: `Deleted ${runDel.deletedCount} runs and ${resultDel.deletedCount} results`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Bulk delete error:", msg, error);
      res.status(500).json({ error: `Bulk delete failed: ${msg}` });
    }
  }
);

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const run = await EvaluationRun.findOne({
      _id: paramId(req),
      orgId: req.user!.orgId,
    });
    if (!run) {
      res.status(404).json({ error: "Run not found" });
      return;
    }
    res.json(run);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch run" });
  }
});

router.post(
  "/start",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { goldenSetId, agentId, judgeModel, entryIndices } = req.body;
      if (!goldenSetId) {
        res.status(400).json({ error: "goldenSetId is required" });
        return;
      }
      if (!agentId) {
        res.status(400).json({ error: "agentId is required" });
        return;
      }

      const run = await evaluationRunner.startRun(
        goldenSetId,
        agentId,
        req.user!.orgId.toString(),
        judgeModel,
        Array.isArray(entryIndices) ? entryIndices : undefined
      );
      res.status(201).json(run);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to start run";
      res.status(400).json({ error: message });
    }
  }
);

router.post(
  "/:id/cancel",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      await evaluationRunner.cancelRun(paramId(req));
      res.json({ message: "Run cancelled" });
    } catch (error) {
      res.status(500).json({ error: "Failed to cancel run" });
    }
  }
);

// SSE endpoint for run progress
router.get("/:id/progress", (req: Request, res: Response) => {
  const runId = paramId(req);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  const onProgress = (data: Record<string, unknown>) => {
    if (data.runId === runId) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);

      if (data.status === "completed" || data.status === "failed") {
        res.end();
      }
    }
  };

  runnerEvents.on("progress", onProgress);

  req.on("close", () => {
    runnerEvents.removeListener("progress", onProgress);
  });
});

router.put(
  "/:id/score-profile",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const id = paramId(req);
      if (!isValidObjectId(id)) {
        res.status(400).json({ error: "Invalid run id" });
        return;
      }
      const { scoreProfileId } = req.body as { scoreProfileId?: string | null };
      const orgId = req.user!.orgId;

      let profileObjectId: mongoose.Types.ObjectId | null = null;
      if (scoreProfileId) {
        if (!isValidObjectId(scoreProfileId)) {
          res.status(400).json({ error: "Invalid scoreProfileId" });
          return;
        }
        const profile = await ScoreProfile.findOne({
          _id: scoreProfileId,
          orgId,
        });
        if (!profile) {
          res.status(404).json({ error: "Score profile not found" });
          return;
        }
        profileObjectId = profile._id as mongoose.Types.ObjectId;
      }

      const run = await EvaluationRun.findOneAndUpdate(
        { _id: id, orgId },
        { scoreProfileId: profileObjectId ?? undefined },
        { new: true }
      );
      if (!run) {
        res.status(404).json({ error: "Run not found" });
        return;
      }
      res.json(run);
    } catch (error) {
      res.status(500).json({ error: "Failed to assign score profile" });
    }
  }
);

router.post(
  "/:id/retry-results",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const id = paramId(req);
      if (!isValidObjectId(id)) {
        res.status(400).json({ error: "Invalid run id" });
        return;
      }
      const { resultIds } = req.body as { resultIds?: string[] };
      if (!Array.isArray(resultIds) || resultIds.length === 0) {
        res.status(400).json({ error: "resultIds array is required" });
        return;
      }
      const validResultIds = resultIds.filter(isValidObjectId);
      if (validResultIds.length === 0) {
        res.status(400).json({ error: "No valid result IDs provided" });
        return;
      }

      const orgId = req.user!.orgId;
      const run = await EvaluationRun.findOne({ _id: id, orgId });
      if (!run) {
        res.status(404).json({ error: "Run not found" });
        return;
      }

      await evaluationRunner.retryEntries(
        id,
        validResultIds,
        orgId.toString()
      );

      res.json({ message: "Retry started", count: validResultIds.length });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: `Retry failed: ${msg}` });
    }
  }
);

router.delete(
  "/:id",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const id = paramId(req);
      if (!isValidObjectId(id)) {
        res.status(400).json({ error: `Invalid run ID: ${id}` });
        return;
      }

      const orgId = req.user!.orgId;
      const objectId = new mongoose.Types.ObjectId(id);

      const resultDel = await EvaluationResult.deleteMany({
        runId: objectId,
        orgId,
      });
      const runDel = await EvaluationRun.findOneAndDelete({
        _id: objectId,
        orgId,
      });

      if (!runDel) {
        res.status(404).json({ error: "Run not found or not in your org" });
        return;
      }

      res.json({
        message: `Deleted run and ${resultDel.deletedCount} results`,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("Delete run error:", msg, error);
      res.status(500).json({ error: `Delete failed: ${msg}` });
    }
  }
);

export default router;
