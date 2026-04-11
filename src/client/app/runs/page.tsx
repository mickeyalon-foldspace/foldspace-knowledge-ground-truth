"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import RunCard from "@/components/RunCard";
import {
  getRuns,
  getGoldenSets,
  getGoldenSet,
  startRun,
  cancelRun,
  deleteRun,
  subscribeToRunProgress,
} from "@/lib/api";
import type {
  EvaluationRunData,
  GoldenSetSummary,
  GoldenSetEntry,
  RunProgress,
} from "@/lib/api";
import { isRtlLanguage } from "@/lib/rtl";

const JUDGE_MODELS = [
  "claude-sonnet-4-20250514",
  "claude-3-5-sonnet-20241022",
  "claude-3-opus-20240229",
  "claude-3-haiku-20240307",
];

type Tab = "active" | "completed" | "failed";

interface LiveRunState {
  stage?: string;
  currentQuestion?: number;
  totalQuestions?: number;
  currentEntry?: string;
}

export default function RunsPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<EvaluationRunData[]>([]);
  const [goldenSets, setGoldenSets] = useState<GoldenSetSummary[]>([]);
  const [selectedSetId, setSelectedSetId] = useState("");
  const [selectedModel, setSelectedModel] = useState(JUDGE_MODELS[0]);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("active");

  // Question selection state
  const [setEntries, setSetEntries] = useState<GoldenSetEntry[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<Set<number>>(
    new Set()
  );
  const [showQuestions, setShowQuestions] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Live stage tracking per run
  const [liveStates, setLiveStates] = useState<Record<string, LiveRunState>>(
    {}
  );
  const cleanupRef = useRef<Map<string, () => void>>(new Map());

  const fetchData = async () => {
    try {
      const [r, g] = await Promise.all([getRuns(), getGoldenSets()]);
      setRuns(r);
      setGoldenSets(g);
      if (g.length > 0 && !selectedSetId) {
        setSelectedSetId(g[0]._id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Load entries when golden set selection changes
  useEffect(() => {
    if (!selectedSetId) {
      setSetEntries([]);
      setSelectedEntries(new Set());
      return;
    }
    let cancelled = false;
    setLoadingEntries(true);
    getGoldenSet(selectedSetId)
      .then((full) => {
        if (cancelled) return;
        setSetEntries(full.entries);
        setSelectedEntries(new Set(full.entries.map((_, i) => i)));
      })
      .catch(() => {
        if (!cancelled) {
          setSetEntries([]);
          setSelectedEntries(new Set());
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingEntries(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSetId]);

  // Subscribe to SSE progress for running runs
  useEffect(() => {
    const activeRunIds = runs
      .filter((r) => r.status === "running" || r.status === "pending")
      .map((r) => r._id);

    // Subscribe to new active runs
    for (const runId of activeRunIds) {
      if (cleanupRef.current.has(runId)) continue;

      const cleanup = subscribeToRunProgress(runId, (progress: RunProgress) => {
        // Update run status
        setRuns((prev) =>
          prev.map((r) =>
            r._id === runId
              ? {
                  ...r,
                  status: progress.status as EvaluationRunData["status"],
                  progress: progress.progress,
                }
              : r
          )
        );

        // Update live stage
        setLiveStates((prev) => ({
          ...prev,
          [runId]: {
            stage: progress.stage,
            currentQuestion: progress.currentQuestion,
            totalQuestions: progress.totalQuestions,
            currentEntry: progress.currentEntry,
          },
        }));

        if (
          progress.status === "completed" ||
          progress.status === "failed"
        ) {
          fetchData();
          // Clean up this subscription
          const fn = cleanupRef.current.get(runId);
          if (fn) {
            fn();
            cleanupRef.current.delete(runId);
          }
        }
      });

      cleanupRef.current.set(runId, cleanup);
    }

    // Clean up subscriptions for runs that are no longer active
    for (const [runId, cleanup] of cleanupRef.current.entries()) {
      if (!activeRunIds.includes(runId)) {
        cleanup();
        cleanupRef.current.delete(runId);
      }
    }

    return () => {};
  }, [runs.map((r) => `${r._id}:${r.status}`).join(",")]);

  // Cleanup all on unmount
  useEffect(() => {
    return () => {
      for (const cleanup of cleanupRef.current.values()) cleanup();
    };
  }, []);

  const toggleEntry = (index: number) => {
    setSelectedEntries((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedEntries((prev) =>
      prev.size === setEntries.length
        ? new Set()
        : new Set(setEntries.map((_, i) => i))
    );
  };

  const handleStartRun = async () => {
    if (!selectedSetId || selectedEntries.size === 0) return;
    setIsStarting(true);
    setError(null);
    try {
      const indices =
        selectedEntries.size === setEntries.length
          ? undefined
          : Array.from(selectedEntries).sort((a, b) => a - b);
      await startRun(selectedSetId, selectedModel, indices);
      setTab("active");
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start run");
    } finally {
      setIsStarting(false);
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await cancelRun(id);
      await fetchData();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to cancel run");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this run and all its results?")) return;
    try {
      await deleteRun(id);
      setRuns(runs.filter((r) => r._id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete run");
    }
  };

  const activeRuns = runs.filter(
    (r) => r.status === "running" || r.status === "pending"
  );
  const completedRuns = runs.filter((r) => r.status === "completed");
  const failedRuns = runs.filter((r) => r.status === "failed");

  const tabRuns =
    tab === "active"
      ? activeRuns
      : tab === "completed"
        ? completedRuns
        : failedRuns;

  const tabCounts = {
    active: activeRuns.length,
    completed: completedRuns.length,
    failed: failedRuns.length,
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          Evaluation Runs
        </h1>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-500 hover:text-red-700"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* New Run form */}
        <div className="bg-white rounded-lg border p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Start New Run
          </h2>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Golden Set
              </label>
              <select
                value={selectedSetId}
                onChange={(e) => setSelectedSetId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {goldenSets.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name} ({s.entryCount} questions)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Judge Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {JUDGE_MODELS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleStartRun}
              disabled={
                isStarting || !selectedSetId || selectedEntries.size === 0
              }
              className="bg-blue-600 text-white rounded-md px-6 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isStarting
                ? "Starting..."
                : `Start Evaluation (${selectedEntries.size})`}
            </button>
          </div>

          {/* Question selection */}
          {selectedSetId && (
            <div className="mt-4 border-t pt-3">
              <button
                type="button"
                onClick={() => setShowQuestions(!showQuestions)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
              >
                <svg
                  className={`h-3 w-3 transition-transform ${showQuestions ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
                {showQuestions ? "Hide" : "Show"} question selection
                <span className="text-gray-400 font-normal ml-1">
                  ({selectedEntries.size} of {setEntries.length} selected)
                </span>
              </button>

              {showQuestions && (
                <div className="mt-2 max-h-[400px] overflow-auto border border-gray-200 rounded-md">
                  {loadingEntries ? (
                    <div className="p-4 text-sm text-gray-500 text-center">
                      Loading questions...
                    </div>
                  ) : setEntries.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500 text-center">
                      No entries found.
                    </div>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr className="border-b">
                          <th className="text-left py-2 px-2">
                            <input
                              type="checkbox"
                              checked={
                                selectedEntries.size === setEntries.length
                              }
                              onChange={toggleAll}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                          </th>
                          <th className="text-left py-2 px-2 text-xs text-gray-500">
                            #
                          </th>
                          <th className="text-left py-2 px-2 text-xs text-gray-500">
                            Question
                          </th>
                          <th className="text-left py-2 px-2 text-xs text-gray-500">
                            Expected Answer
                          </th>
                          <th className="text-left py-2 px-2 text-xs text-gray-500">
                            Lang
                          </th>
                          <th className="text-left py-2 px-2 text-xs text-gray-500">
                            Category
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {setEntries.map((entry, i) => {
                          const isRtl = isRtlLanguage(entry.language);
                          const checked = selectedEntries.has(i);
                          return (
                            <tr
                              key={i}
                              className={`border-b border-gray-100 hover:bg-gray-50 ${
                                !checked ? "opacity-40" : ""
                              }`}
                            >
                              <td className="py-1.5 px-2">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleEntry(i)}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                              </td>
                              <td className="py-1.5 px-2 text-gray-400">
                                {i + 1}
                              </td>
                              <td
                                className="py-1.5 px-2 max-w-[250px] truncate"
                                dir={isRtl ? "rtl" : "ltr"}
                                title={entry.question}
                              >
                                {entry.question}
                              </td>
                              <td
                                className="py-1.5 px-2 max-w-[250px] truncate text-gray-500"
                                dir={isRtl ? "rtl" : "ltr"}
                                title={entry.expectedAnswer}
                              >
                                {entry.expectedAnswer.length > 80
                                  ? entry.expectedAnswer.substring(0, 80) + "..."
                                  : entry.expectedAnswer}
                              </td>
                              <td className="py-1.5 px-2 uppercase text-gray-500 text-xs">
                                {entry.language}
                              </td>
                              <td className="py-1.5 px-2 text-gray-500 text-xs">
                                {entry.category || "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4">
          {(["active", "completed", "failed"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {t === "active" ? "Active" : t === "completed" ? "Completed" : "Failed"}
              {tabCounts[t] > 0 && (
                <span
                  className={`ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs ${
                    tab === t
                      ? "bg-blue-100 text-blue-700"
                      : t === "active" && tabCounts[t] > 0
                        ? "bg-blue-100 text-blue-700 animate-pulse"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {tabCounts[t]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Runs list */}
        {loading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : tabRuns.length === 0 ? (
          <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
            {tab === "active"
              ? "No active runs. Start one above."
              : tab === "completed"
                ? "No completed runs yet."
                : "No failed runs."}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tabRuns.map((run) => {
              const live = liveStates[run._id] || {};
              return (
                <RunCard
                  key={run._id}
                  run={run}
                  stage={live.stage}
                  currentQuestion={live.currentQuestion}
                  totalQuestions={live.totalQuestions}
                  currentEntry={live.currentEntry}
                  onView={(id) => router.push(`/runs/${id}`)}
                  onDelete={handleDelete}
                  onCancel={handleCancel}
                />
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
