import { EventEmitter } from "events";
import { Types } from "mongoose";
import { GoldenSet, IGoldenSetEntry } from "../models/GoldenSet.js";
import { Agent } from "../models/Agent.js";
import {
  EvaluationRun,
  IEvaluationRun,
  IRunSummary,
} from "../models/EvaluationRun.js";
import {
  EvaluationResult,
  IEvaluationResult,
} from "../models/EvaluationResult.js";
import { PlaywrightEngine, AgentCredentials } from "./playwright-engine.js";
import { JudgeService } from "./judge.js";

export interface RunProgress {
  runId: string;
  status: string;
  progress: number;
  stage?: string;
  currentQuestion?: number;
  totalQuestions?: number;
  currentEntry?: string;
  error?: string;
  logLine?: string;
}

class RunnerEventBus extends EventEmitter {}
export const runnerEvents = new RunnerEventBus();

export class EvaluationRunner {
  private playwrightEngine: PlaywrightEngine;
  private judgeService: JudgeService;
  private abortControllers = new Map<string, AbortController>();

  constructor() {
    this.playwrightEngine = new PlaywrightEngine();
    this.judgeService = new JudgeService();
  }

  async startRun(
    goldenSetId: string,
    agentId: string,
    orgId: string,
    judgeModel?: string,
    entryIndices?: number[]
  ): Promise<IEvaluationRun> {
    const goldenSet = await GoldenSet.findById(goldenSetId);
    if (!goldenSet) {
      throw new Error(`Golden set not found: ${goldenSetId}`);
    }

    const agent = await Agent.findById(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (judgeModel) {
      this.judgeService.setModel(judgeModel);
    }

    let entries = goldenSet.entries;
    if (entryIndices && entryIndices.length > 0) {
      entries = entryIndices
        .filter((i) => i >= 0 && i < goldenSet.entries.length)
        .map((i) => goldenSet.entries[i]);
    }

    if (entries.length === 0) {
      throw new Error("No entries selected for evaluation");
    }

    const agentCreds: AgentCredentials = {
      url: agent.url,
      apiBaseUrl: agent.apiBaseUrl,
      backendUrl: agent.backendUrl || "",
      username: agent.username,
      password: agent.password,
    };

    // Verify authentication before creating the run
    const testEngine = new PlaywrightEngine();
    try {
      await testEngine.initialize();
      await testEngine.login(agentCreds);
    } catch (err) {
      await testEngine.close();
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Authentication check failed for agent "${agent.name}": ${msg}`);
    }
    await testEngine.close();

    const run = await EvaluationRun.create({
      orgId: new Types.ObjectId(orgId),
      goldenSetId: new Types.ObjectId(goldenSetId),
      goldenSetName: goldenSet.name,
      agentId: new Types.ObjectId(agentId),
      agentName: agent.name,
      status: "pending",
      progress: 0,
      judgeModel: this.judgeService.getModel(),
    });

    this.executeRun(run._id!.toString(), entries, agentCreds, orgId).catch((err) => {
      console.error(`[Runner] Run ${run._id} failed:`, err);
    });

    return run;
  }

  async cancelRun(runId: string): Promise<void> {
    const controller = this.abortControllers.get(runId);
    if (controller) {
      controller.abort();
    }
    await EvaluationRun.findByIdAndUpdate(runId, {
      status: "failed",
      error: "Cancelled by user",
      completedAt: new Date(),
    });
    this.emitProgress(runId, {
      status: "failed",
      progress: 0,
      stage: "cancelled",
      error: "Cancelled",
    });
  }

  private async executeRun(
    runId: string,
    entries: IGoldenSetEntry[],
    agentCreds: AgentCredentials,
    orgId: string
  ): Promise<void> {
    const controller = new AbortController();
    this.abortControllers.set(runId, controller);

    try {
      await EvaluationRun.findByIdAndUpdate(runId, {
        status: "running",
        startedAt: new Date(),
      });
      this.emitProgress(runId, {
        status: "running",
        progress: 0,
        stage: "initializing",
        totalQuestions: entries.length,
      });

      this.playwrightEngine.clearLogs();
      this.playwrightEngine.setStageCallback((stage) => {
        this.emitProgress(runId, {
          status: "running",
          progress: this.lastProgress.get(runId) || 0,
          stage,
          totalQuestions: entries.length,
        });
      });
      this.playwrightEngine.setLogCallback((line) => {
        this.emitProgress(runId, {
          status: "running",
          progress: this.lastProgress.get(runId) || 0,
          logLine: line,
          totalQuestions: entries.length,
        });
      });

      await this.playwrightEngine.initialize();
      await this.playwrightEngine.login(agentCreds);
      await this.playwrightEngine.navigateToPlayground();

      const allResults: IEvaluationResult[] = [];

      for (let i = 0; i < entries.length; i++) {
        if (controller.signal.aborted) break;

        const entry = entries[i];
        const progress = Math.round(((i + 1) / entries.length) * 100);
        this.lastProgress.set(runId, progress);

        this.emitProgress(runId, {
          status: "running",
          progress,
          stage: "prompting_agent",
          currentQuestion: i + 1,
          totalQuestions: entries.length,
          currentEntry: entry.question.substring(0, 80),
        });

        try {
          const pwResult = await this.playwrightEngine.askQuestion(
            entry.question
          );

          if (pwResult.failed) {
            console.error(
              `[Runner] FAILED to get results for entry ${i} ("${entry.question.substring(0, 50)}") — skipping storage`
            );

            this.emitProgress(runId, {
              status: "running",
              progress,
              stage: "question_failed_no_results",
              currentQuestion: i + 1,
              totalQuestions: entries.length,
              currentEntry: entry.question.substring(0, 80),
              error: "FAILED to get results — analysis/articles not retrieved",
            });

            await EvaluationRun.findByIdAndUpdate(runId, {
              progress,
              playwrightLog: this.playwrightEngine.getLogs(),
            });
            continue;
          }

          this.emitProgress(runId, {
            status: "running",
            progress,
            stage: "judging_response",
            currentQuestion: i + 1,
            totalQuestions: entries.length,
            currentEntry: entry.question.substring(0, 80),
          });

          // Convert chunks to the format the judge expects
          const judgeArticles = pwResult.searchKnowledge.chunks.map((c) => ({
            title: c.title,
            chunkCount: 1,
            chunks: [{ content: c.content, metadata: {} }],
          }));

          const judgeScores = await this.judgeService.evaluate({
            question: entry.question,
            expectedAnswer: entry.expectedAnswer,
            actualAnswer: pwResult.actualAnswer,
            language: entry.language,
            retrievedArticles: judgeArticles,
          });

          const result = await EvaluationResult.create({
            orgId: new Types.ObjectId(orgId),
            runId: new Types.ObjectId(runId),
            entryIndex: i,
            question: entry.question,
            expectedAnswer: entry.expectedAnswer,
            actualAnswer: pwResult.actualAnswer,
            language: entry.language,
            category: entry.category,
            topic: entry.topic,
            judgeScores,
            searchKnowledge: pwResult.searchKnowledge,
            retrievedArticles: judgeArticles,
            responseTimeMs: pwResult.responseTimeMs,
            rawApiResponses: pwResult.rawApiResponses,
          });

          allResults.push(result);

          this.emitProgress(runId, {
            status: "running",
            progress,
            stage: "question_complete",
            currentQuestion: i + 1,
            totalQuestions: entries.length,
            currentEntry: entry.question.substring(0, 80),
          });

          await EvaluationRun.findByIdAndUpdate(runId, {
            progress,
            playwrightLog: this.playwrightEngine.getLogs(),
          });
        } catch (entryError) {
          const errMsg = entryError instanceof Error ? entryError.message : String(entryError);
          console.error(
            `[Runner] Error entry ${i} ("${entry.question.substring(0, 50)}"): ${errMsg}`
          );

          this.emitProgress(runId, {
            status: "running",
            progress,
            stage: "question_error",
            currentQuestion: i + 1,
            totalQuestions: entries.length,
            currentEntry: entry.question.substring(0, 80),
            error:
              entryError instanceof Error
                ? entryError.message
                : String(entryError),
          });

          await EvaluationResult.create({
            orgId: new Types.ObjectId(orgId),
            runId: new Types.ObjectId(runId),
            entryIndex: i,
            question: entry.question,
            expectedAnswer: entry.expectedAnswer,
            actualAnswer: `ERROR: ${entryError instanceof Error ? entryError.message : String(entryError)}`,
            language: entry.language,
            category: entry.category,
            topic: entry.topic,
            judgeScores: {
              correctness: {
                score: 1,
                explanation: "Failed to process this question",
              },
              completeness: {
                score: 1,
                explanation: "Failed to process this question",
              },
              relevance: {
                score: 1,
                explanation: "Failed to process this question",
              },
              faithfulness: {
                score: 1,
                explanation: "Failed to process this question",
              },
              overallScore: 1,
              detectedLanguage: entry.language,
              languageMatch: false,
            },
            retrievedArticles: [],
            responseTimeMs: 0,
          });
        }
      }

      this.emitProgress(runId, {
        status: "running",
        progress: 99,
        stage: "computing_summary",
        totalQuestions: entries.length,
      });

      const summary = await this.computeSummary(runId);

      await EvaluationRun.findByIdAndUpdate(runId, {
        status: "completed",
        progress: 100,
        completedAt: new Date(),
        summary,
        playwrightLog: this.playwrightEngine.getLogs(),
      });

      this.emitProgress(runId, {
        status: "completed",
        progress: 100,
        stage: "done",
      });
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : String(error);
      await EvaluationRun.findByIdAndUpdate(runId, {
        status: "failed",
        error: errorMsg,
        completedAt: new Date(),
        playwrightLog: this.playwrightEngine.getLogs(),
      });
      this.emitProgress(runId, {
        status: "failed",
        progress: 0,
        stage: "error",
        error: errorMsg,
      });
    } finally {
      await this.playwrightEngine.close();
      this.abortControllers.delete(runId);
      this.lastProgress.delete(runId);
    }
  }

  private lastProgress = new Map<string, number>();

  private async computeSummary(runId: string): Promise<IRunSummary> {
    const results = await EvaluationResult.find({
      runId: new Types.ObjectId(runId),
    });

    if (results.length === 0) {
      return {
        totalQuestions: 0,
        completedQuestions: 0,
        avgCorrectness: 0,
        avgCompleteness: 0,
        avgRelevance: 0,
        avgFaithfulness: 0,
        avgOverallScore: 0,
        byLanguage: {},
      };
    }

    const total = results.length;
    let sumCorrectness = 0;
    let sumCompleteness = 0;
    let sumRelevance = 0;
    let sumFaithfulness = 0;
    let sumOverall = 0;

    const langMap: Record<string, { count: number; sumScore: number }> = {};

    for (const r of results) {
      sumCorrectness += r.judgeScores.correctness.score;
      sumCompleteness += r.judgeScores.completeness.score;
      sumRelevance += r.judgeScores.relevance.score;
      sumFaithfulness += r.judgeScores.faithfulness.score;
      sumOverall += r.judgeScores.overallScore;

      const lang = r.language;
      if (!langMap[lang]) {
        langMap[lang] = { count: 0, sumScore: 0 };
      }
      langMap[lang].count++;
      langMap[lang].sumScore += r.judgeScores.overallScore;
    }

    const byLanguage: IRunSummary["byLanguage"] = {};
    for (const [lang, data] of Object.entries(langMap)) {
      byLanguage[lang] = {
        count: data.count,
        avgOverallScore: parseFloat(
          (data.sumScore / data.count).toFixed(2)
        ),
      };
    }

    return {
      totalQuestions: total,
      completedQuestions: total,
      avgCorrectness: parseFloat((sumCorrectness / total).toFixed(2)),
      avgCompleteness: parseFloat((sumCompleteness / total).toFixed(2)),
      avgRelevance: parseFloat((sumRelevance / total).toFixed(2)),
      avgFaithfulness: parseFloat((sumFaithfulness / total).toFixed(2)),
      avgOverallScore: parseFloat((sumOverall / total).toFixed(2)),
      byLanguage,
    };
  }

  private emitProgress(runId: string, data: Partial<RunProgress>): void {
    runnerEvents.emit("progress", { runId, ...data });
  }
}

export const evaluationRunner = new EvaluationRunner();
