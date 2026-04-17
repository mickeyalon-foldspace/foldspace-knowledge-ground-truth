"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/components/AuthProvider";
import RunCard from "@/components/RunCard";
import {
  getRuns,
  getAgents,
  getGoldenSets,
  getGoldenSet,
  startRun,
  cancelRun,
  deleteRun,
  bulkDeleteRuns,
  subscribeToRunProgress,
} from "@/lib/api";
import type {
  EvaluationRunData,
  AgentData,
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
type ViewMode = "card" | "table";

const statusStyles: Record<string, string> = {
  pending: "bg-gray-100 text-gray-800",
  running: "bg-blue-100 text-blue-800 animate-pulse",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

interface LiveRunState {
  stage?: string;
  currentQuestion?: number;
  totalQuestions?: number;
  currentEntry?: string;
}

export default function RunsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const router = useRouter();
  const [runs, setRuns] = useState<EvaluationRunData[]>([]);
  const [agents, setAgents] = useState<AgentData[]>([]);
  const [goldenSets, setGoldenSets] = useState<GoldenSetSummary[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [selectedSetId, setSelectedSetId] = useState("");
  const [selectedModel, setSelectedModel] = useState(JUDGE_MODELS[0]);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("active");
  const [viewMode, setViewMode] = useState<ViewMode>("card");

  // Question selection state
  const [setEntries, setSetEntries] = useState<GoldenSetEntry[]>([]);
  const [selectedEntries, setSelectedEntries] = useState<Set<number>>(
    new Set()
  );
  const [showQuestions, setShowQuestions] = useState(false);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Run selection for bulk operations
  const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(new Set());

  // Live stage tracking per run
  const [liveStates, setLiveStates] = useState<Record<string, LiveRunState>>(
    {}
  );
  const [liveLogs, setLiveLogs] = useState<Record<string, string[]>>({});
  const cleanupRef = useRef<Map<string, () => void>>(new Map());

  const fetchData = async () => {
    try {
      const [r, a, g] = await Promise.all([
        getRuns(),
        getAgents(),
        getGoldenSets(),
      ]);
      setRuns(r);
      setAgents(a);
      setGoldenSets(g);
      if (a.length > 0 && !selectedAgentId) {
        setSelectedAgentId(a[0]._id);
      }
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
        if (progress.stage) {
          setLiveStates((prev) => ({
            ...prev,
            [runId]: {
              stage: progress.stage,
              currentQuestion: progress.currentQuestion,
              totalQuestions: progress.totalQuestions,
              currentEntry: progress.currentEntry,
            },
          }));
        }

        // Collect live log lines
        if (progress.logLine) {
          setLiveLogs((prev) => {
            const existing = prev[runId] || [];
            const updated = [...existing, progress.logLine!];
            if (updated.length > 100) updated.splice(0, updated.length - 100);
            return { ...prev, [runId]: updated };
          });
        }

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
    if (!selectedSetId || !selectedAgentId || selectedEntries.size === 0) return;
    setIsStarting(true);
    setError(null);
    try {
      const indices =
        selectedEntries.size === setEntries.length
          ? undefined
          : Array.from(selectedEntries).sort((a, b) => a - b);
      await startRun(selectedSetId, selectedAgentId, selectedModel, indices);
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

  const handleDelete = async (id: string) => {
    try {
      await deleteRun(id);
      setRuns((prev) => prev.filter((r) => r._id !== id));
      setSelectedRunIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete run");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRunIds.size === 0) return;
    try {
      await bulkDeleteRuns(Array.from(selectedRunIds));
      setRuns((prev) => prev.filter((r) => !selectedRunIds.has(r._id)));
      setSelectedRunIds(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to bulk delete");
    }
  };

  const toggleRunSelection = (id: string) => {
    setSelectedRunIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const toggleSelectAllTab = () => {
    const ids = tabRuns.map((r) => r._id);
    const allSelected = ids.every((id) => selectedRunIds.has(id));
    setSelectedRunIds((prev) => {
      const n = new Set(prev);
      if (allSelected) ids.forEach((id) => n.delete(id));
      else ids.forEach((id) => n.add(id));
      return n;
    });
  };

  const tabCounts = {
    active: activeRuns.length,
    completed: completedRuns.length,
    failed: failedRuns.length,
  };

  return (
    <ProtectedRoute>
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
        {isAdmin && (
        <div className="bg-white rounded-lg border p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            Start New Run
          </h2>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[180px]">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Agent
              </label>
              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {agents.length === 0 && (
                  <option value="">No agents configured</option>
                )}
                {agents.map((a) => (
                  <option key={a._id} value={a._id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 min-w-[180px]">
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
            <div className="flex-1 min-w-[180px]">
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
                isStarting ||
                !selectedSetId ||
                !selectedAgentId ||
                selectedEntries.size === 0
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
        )}

        {/* Tabs + view toggle + bulk actions */}
        <div className="flex items-center justify-between border-b border-gray-200 mb-4">
          <div className="flex">
            {(["active", "completed", "failed"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setSelectedRunIds(new Set()); }}
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
          <div className="flex items-center gap-3 pb-1">
            {/* View toggle */}
            <div className="flex items-center bg-gray-100 rounded-md p-0.5">
              <button
                onClick={() => setViewMode("card")}
                className={`p-1.5 rounded transition-colors ${viewMode === "card" ? "bg-white shadow-sm text-blue-600" : "text-gray-400 hover:text-gray-600"}`}
                title="Card view"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded transition-colors ${viewMode === "table" ? "bg-white shadow-sm text-blue-600" : "text-gray-400 hover:text-gray-600"}`}
                title="Table view"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M3 6h18M3 12h18M3 18h18" />
                </svg>
              </button>
            </div>
            {isAdmin && tabRuns.length > 0 && (
              <>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tabRuns.length > 0 && tabRuns.every((r) => selectedRunIds.has(r._id))}
                    onChange={toggleSelectAllTab}
                    className="rounded border-gray-300"
                  />
                  Select all
                </label>
                {selectedRunIds.size > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="text-xs bg-red-600 text-white rounded px-3 py-1 hover:bg-red-700 transition-colors"
                  >
                    Delete {selectedRunIds.size} selected
                  </button>
                )}
              </>
            )}
          </div>
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
        ) : viewMode === "table" ? (
          /* ---- TABLE VIEW ---- */
          <div className="bg-white rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {isAdmin && (
                      <th className="w-10 px-3 py-3">
                        <input
                          type="checkbox"
                          checked={tabRuns.length > 0 && tabRuns.every((r) => selectedRunIds.has(r._id))}
                          onChange={toggleSelectAllTab}
                          className="rounded border-gray-300"
                        />
                      </th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Golden Set</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Agent</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Evals</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Overall</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Correct</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Complete</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Relevant</th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Faithful</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tabRuns.map((run) => {
                    const s = run.summary;
                    return (
                      <tr key={run._id} className="hover:bg-gray-50 transition-colors">
                        {isAdmin && (
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedRunIds.has(run._id)}
                              onChange={() => toggleRunSelection(run._id)}
                              className="rounded border-gray-300"
                            />
                          </td>
                        )}
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 max-w-[200px] truncate">{run.goldenSetName}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-[140px] truncate">{run.agentName || "-"}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[run.status] || statusStyles.pending}`}>
                            {run.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {s ? (
                            <span className="inline-flex items-center justify-center min-w-[40px] px-2 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-700 text-sm font-bold">
                              {s.completedQuestions}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {s ? (
                            <span className={`inline-flex items-center justify-center min-w-[40px] px-2 py-1 rounded-md text-sm font-bold text-white bg-gradient-to-r ${
                              s.avgOverallScore >= 4 ? "from-green-500 to-emerald-600" :
                              s.avgOverallScore >= 3 ? "from-yellow-500 to-amber-600" :
                              s.avgOverallScore >= 2 ? "from-orange-500 to-orange-600" :
                              "from-red-500 to-red-600"
                            }`}>
                              {s.avgOverallScore.toFixed(1)}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-sm">-</span>
                          )}
                        </td>
                        {([
                          s?.avgCorrectness,
                          s?.avgCompleteness,
                          s?.avgRelevance,
                          s?.avgFaithfulness,
                        ] as (number | undefined)[]).map((val, idx) => (
                          <td key={idx} className="px-4 py-3 text-center">
                            {val != null ? (
                              <span className={`text-sm font-semibold ${
                                val >= 4 ? "text-green-600" :
                                val >= 3 ? "text-yellow-600" :
                                val >= 2 ? "text-orange-500" :
                                "text-red-600"
                              }`}>
                                {val.toFixed(1)}
                              </span>
                            ) : (
                              <span className="text-gray-400 text-sm">-</span>
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{new Date(run.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            {run.status === "completed" && (
                              <button
                                onClick={() => router.push(`/runs/${run._id}`)}
                                className="text-xs bg-blue-600 text-white rounded px-2.5 py-1 hover:bg-blue-700 transition-colors"
                              >
                                View
                              </button>
                            )}
                            {run.status === "running" && isAdmin && (
                              <button
                                onClick={() => handleCancel(run._id)}
                                className="text-xs bg-yellow-500 text-white rounded px-2.5 py-1 hover:bg-yellow-600 transition-colors"
                              >
                                Cancel
                              </button>
                            )}
                            {isAdmin && (
                              <button
                                onClick={() => handleDelete(run._id)}
                                className="text-xs text-red-600 border border-red-200 rounded px-2.5 py-1 hover:bg-red-50 transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ---- CARD VIEW ---- */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {tabRuns.map((run) => {
              const live = liveStates[run._id] || {};
              const isRunActive = run.status === "running" || run.status === "pending" || run.status === "failed";
              return (
                <div key={run._id} className={isRunActive ? "lg:col-span-2" : ""}>
                  <RunCard
                    run={run}
                    stage={live.stage}
                    currentQuestion={live.currentQuestion}
                    totalQuestions={live.totalQuestions}
                    currentEntry={live.currentEntry}
                    liveLogLines={liveLogs[run._id]}
                    selected={selectedRunIds.has(run._id)}
                    onSelect={isAdmin ? toggleRunSelection : undefined}
                    onView={(id) => router.push(`/runs/${id}`)}
                    onDelete={isAdmin ? handleDelete : undefined}
                    onCancel={isAdmin ? handleCancel : undefined}
                  />
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
    </ProtectedRoute>
  );
}
