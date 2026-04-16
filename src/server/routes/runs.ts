import { Router, Request, Response } from "express";
import { EvaluationRun } from "../models/EvaluationRun.js";
import { evaluationRunner, runnerEvents } from "../services/runner.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
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

router.delete(
  "/:id",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const id = paramId(req);
      const { EvaluationResult } = await import(
        "../models/EvaluationResult.js"
      );
      await EvaluationResult.deleteMany({ runId: id, orgId: req.user!.orgId });
      await EvaluationRun.findOneAndDelete({
        _id: id,
        orgId: req.user!.orgId,
      });
      res.json({ message: "Run and results deleted" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete run" });
    }
  }
);

export default router;
