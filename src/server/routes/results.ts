import { Router, Request, Response } from "express";
import { EvaluationResult } from "../models/EvaluationResult.js";
import { EvaluationRun } from "../models/EvaluationRun.js";
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
          $or: [
            { resultType: "scored" },
            { resultType: { $exists: false } },
          ],
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

async function recalculateRunSummary(runId: string, orgId: string) {
  const allResults = await EvaluationResult.find({
    runId: new mongoose.Types.ObjectId(runId),
    orgId: new mongoose.Types.ObjectId(orgId),
  });

  const scored = allResults.filter(
    (r) => (r.resultType ?? "scored") === "scored" && r.judgeScores
  );

  if (scored.length === 0) {
    await EvaluationRun.findByIdAndUpdate(runId, {
      summary: {
        totalQuestions: allResults.length,
        completedQuestions: allResults.length,
        avgCorrectness: 0,
        avgCompleteness: 0,
        avgRelevance: 0,
        avgFaithfulness: 0,
        avgOverallScore: 0,
        byLanguage: {},
      },
    });
    return;
  }

  const total = scored.length;
  let sumCorrectness = 0;
  let sumCompleteness = 0;
  let sumRelevance = 0;
  let sumFaithfulness = 0;
  let sumOverall = 0;
  const langMap: Record<string, { count: number; sumScore: number }> = {};

  for (const r of scored) {
    const js = r.judgeScores!;
    sumCorrectness += js.correctness.score;
    sumCompleteness += js.completeness.score;
    sumRelevance += js.relevance.score;
    sumFaithfulness += js.faithfulness.score;
    sumOverall += js.overallScore;
    const lang = r.language;
    if (!langMap[lang]) langMap[lang] = { count: 0, sumScore: 0 };
    langMap[lang].count++;
    langMap[lang].sumScore += js.overallScore;
  }

  const byLanguage: Record<string, { count: number; avgOverallScore: number }> = {};
  for (const [lang, data] of Object.entries(langMap)) {
    byLanguage[lang] = {
      count: data.count,
      avgOverallScore: parseFloat((data.sumScore / data.count).toFixed(2)),
    };
  }

  await EvaluationRun.findByIdAndUpdate(runId, {
    summary: {
      totalQuestions: allResults.length,
      completedQuestions: allResults.length,
      avgCorrectness: parseFloat((sumCorrectness / total).toFixed(2)),
      avgCompleteness: parseFloat((sumCompleteness / total).toFixed(2)),
      avgRelevance: parseFloat((sumRelevance / total).toFixed(2)),
      avgFaithfulness: parseFloat((sumFaithfulness / total).toFixed(2)),
      avgOverallScore: parseFloat((sumOverall / total).toFixed(2)),
      byLanguage,
    },
  });
}

router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const result = await EvaluationResult.findOneAndDelete({
      _id: paramValue(req, "id"),
      orgId: req.user!.orgId,
    });
    if (!result) {
      res.status(404).json({ error: "Result not found" });
      return;
    }

    await recalculateRunSummary(result.runId.toString(), req.user!.orgId.toString());

    res.json({ message: "Result deleted", runId: result.runId.toString() });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete result" });
  }
});

router.get("/run/:runId/export-csv", async (req: Request, res: Response) => {
  try {
    const runId = paramValue(req, "runId");
    const results = await EvaluationResult.find({
      runId,
      orgId: req.user!.orgId,
    })
      .sort({ entryIndex: 1 })
      .select("-rawApiResponses");

    if (results.length === 0) {
      res.status(404).json({ error: "No results found for this run" });
      return;
    }

    const escapeCsv = (val: string) => {
      if (val.includes('"') || val.includes(",") || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const headers = [
      "#",
      "Result Type",
      "Error Message",
      "Question",
      "Expected Answer",
      "Actual Answer",
      "Language",
      "Category",
      "Topic",
      "Correctness",
      "Correctness Explanation",
      "Completeness",
      "Completeness Explanation",
      "Relevance",
      "Relevance Explanation",
      "Faithfulness",
      "Faithfulness Explanation",
      "Knowledge Quality",
      "Knowledge Quality Explanation",
      "Knowledge Gaps",
      "Knowledge Improvements",
      "Overall Score",
      "Language Match",
      "Detected Language",
      "Chunks Retrieved",
      "Chunk Titles",
    ];

    const rows = results.map((r) => {
      const js = r.judgeScores;
      const kq = js?.knowledgeQuality;
      return [
        String(r.entryIndex + 1),
        r.resultType ?? "scored",
        escapeCsv(r.errorMessage || ""),
        escapeCsv(r.question),
        escapeCsv(r.expectedAnswer),
        escapeCsv(r.actualAnswer),
        r.language,
        r.category || "",
        r.topic || "",
        js ? String(js.correctness.score) : "",
        js ? escapeCsv(js.correctness.explanation) : "",
        js ? String(js.completeness.score) : "",
        js ? escapeCsv(js.completeness.explanation) : "",
        js ? String(js.relevance.score) : "",
        js ? escapeCsv(js.relevance.explanation) : "",
        js ? String(js.faithfulness.score) : "",
        js ? escapeCsv(js.faithfulness.explanation) : "",
        String(kq?.score || ""),
        escapeCsv(kq?.explanation || ""),
        escapeCsv((kq?.gaps || []).join(" | ")),
        escapeCsv((kq?.improvements || []).join(" | ")),
        js ? String(js.overallScore) : "",
        js ? (js.languageMatch ? "Yes" : "No") : "",
        js?.detectedLanguage || "",
        String(r.searchKnowledge?.chunks?.length || 0),
        escapeCsv(
          (r.searchKnowledge?.chunks || []).map((c) => c.title).join(" | ")
        ),
      ];
    });

    const BOM = "\uFEFF";
    const csv = BOM + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="evaluation-run-${runId}.csv"`
    );
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: "Failed to export results" });
  }
});

export default router;
