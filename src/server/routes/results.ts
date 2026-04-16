import { Router, Request, Response } from "express";
import { EvaluationResult } from "../models/EvaluationResult.js";
import mongoose from "mongoose";

const router = Router();

function paramValue(req: Request, key: string): string {
  const val = req.params[key];
  return Array.isArray(val) ? val[0] : val;
}

router.get("/run/:runId", async (req: Request, res: Response) => {
  try {
    const runId = paramValue(req, "runId");
    const { language, category, minScore, maxScore } = req.query;

    const filter: Record<string, unknown> = {
      runId,
      orgId: req.user!.orgId,
    };

    if (language) {
      filter.language = language;
    }
    if (category) {
      filter.category = category;
    }
    if (minScore || maxScore) {
      filter["judgeScores.overallScore"] = {};
      if (minScore) {
        (filter["judgeScores.overallScore"] as Record<string, number>).$gte =
          parseFloat(minScore as string);
      }
      if (maxScore) {
        (filter["judgeScores.overallScore"] as Record<string, number>).$lte =
          parseFloat(maxScore as string);
      }
    }

    const results = await EvaluationResult.find(filter)
      .sort({ entryIndex: 1 })
      .select("-rawApiResponses");

    res.json(results);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch results" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const result = await EvaluationResult.findOne({
      _id: paramValue(req, "id"),
      orgId: req.user!.orgId,
    });
    if (!result) {
      res.status(404).json({ error: "Result not found" });
      return;
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch result" });
  }
});

router.get("/run/:runId/stats", async (req: Request, res: Response) => {
  try {
    const runId = paramValue(req, "runId");
    const orgId = req.user!.orgId;
    const stats = await EvaluationResult.aggregate([
      {
        $match: {
          runId: new mongoose.Types.ObjectId(runId),
          orgId: new mongoose.Types.ObjectId(orgId.toString()),
        },
      },
      {
        $group: {
          _id: "$language",
          count: { $sum: 1 },
          avgCorrectness: {
            $avg: "$judgeScores.correctness.score",
          },
          avgCompleteness: {
            $avg: "$judgeScores.completeness.score",
          },
          avgRelevance: { $avg: "$judgeScores.relevance.score" },
          avgFaithfulness: {
            $avg: "$judgeScores.faithfulness.score",
          },
          avgOverall: { $avg: "$judgeScores.overallScore" },
          avgResponseTime: { $avg: "$responseTimeMs" },
          languageMatchRate: {
            $avg: {
              $cond: ["$judgeScores.languageMatch", 1, 0],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Failed to compute stats" });
  }
});

export default router;
