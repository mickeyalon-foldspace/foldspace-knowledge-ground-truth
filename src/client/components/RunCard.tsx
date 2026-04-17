"use client";

import { useState, useEffect, useRef } from "react";
import type { EvaluationRunData } from "@/lib/api";

interface RunCardProps {
  run: EvaluationRunData;
  stage?: string;
  currentQuestion?: number;
  totalQuestions?: number;
  currentEntry?: string;
  liveLogLines?: string[];
  selected?: boolean;
  onSelect?: (id: string) => void;
  onView: (runId: string) => void;
  onDelete?: (runId: string) => void;
  onCancel?: (runId: string) => void;
}

const statusStyles: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  running: "bg-blue-100 text-blue-700 animate-pulse",
  completed: "bg-emerald-50 text-emerald-700",
  failed: "bg-red-50 text-red-700",
};

const STAGE_LABELS: Record<string, { label: string; icon: string }> = {
  initializing: { label: "Initializing", icon: "⚙️" },
  launching_browser: { label: "Launching browser", icon: "🌐" },
  logging_in: { label: "Logging in to Foldspace", icon: "🔑" },
  navigating_to_playground: { label: "Opening playground", icon: "🧭" },
  new_chat: { label: "Starting new chat", icon: "💬" },
  typing_question: { label: "Typing question", icon: "⌨️" },
  waiting_for_response: { label: "Waiting for agent response", icon: "⏳" },
  prompting_agent: { label: "Prompting agent", icon: "🤖" },
  judging_response: { label: "Analyzing with LLM judge", icon: "⚖️" },
  extracting_analysis: { label: "Extracting knowledge articles", icon: "📚" },
  fetching_analysis: { label: "Fetching analysis data", icon: "📡" },
  question_complete: { label: "Question done", icon: "✅" },
  question_error: { label: "Question failed", icon: "❌" },
  question_failed_no_results: { label: "No results retrieved", icon: "⚠️" },
  computing_summary: { label: "Computing summary", icon: "📊" },
  done: { label: "Complete", icon: "🎉" },
  cancelled: { label: "Cancelled", icon: "🚫" },
  error: { label: "Error", icon: "💥" },
};

const FAILURE_PATTERN = /FAILED|TIMEOUT|ERROR|failed|error|timed?\s*out/i;

function isFailureLine(line: string): boolean {
  return FAILURE_PATTERN.test(line);
}

function scoreColor(score: number): string {
  if (score >= 4) return "text-emerald-600";
  if (score >= 3) return "text-amber-600";
  if (score >= 2) return "text-orange-500";
  return "text-red-500";
}

function scoreBg(score: number): string {
  if (score >= 4) return "bg-emerald-50 border-emerald-200";
  if (score >= 3) return "bg-amber-50 border-amber-200";
  if (score >= 2) return "bg-orange-50 border-orange-200";
  return "bg-red-50 border-red-200";
}

function overallGradient(score: number): string {
  if (score >= 4) return "from-emerald-500 to-green-600";
  if (score >= 3) return "from-amber-500 to-yellow-600";
  if (score >= 2) return "from-orange-500 to-orange-600";
  return "from-red-500 to-rose-600";
}

function LogTerminal({
  lines,
  maxHeight,
  autoScroll,
}: {
  lines: string[];
  maxHeight: string;
  autoScroll?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current && autoScroll !== false) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [lines.length, autoScroll]);

  return (
    <div
      ref={ref}
      className="overflow-y-auto bg-gray-950 text-green-400 text-xs font-mono p-3 rounded-lg border border-gray-700"
      style={{ maxHeight }}
    >
      {lines.length === 0 ? (
        <div className="text-gray-500 animate-pulse">
          Waiting for logs...
        </div>
      ) : (
        lines.map((line, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap leading-5 py-px ${isFailureLine(line) ? "text-red-400 font-semibold" : ""}`}
          >
            {line}
          </div>
        ))
      )}
    </div>
  );
}

function LogModal({
  title,
  lines,
  onClose,
}: {
  title: string;
  lines: string[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [lines.length]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={onClose}
    >
      <div
        className="bg-gray-950 rounded-lg border border-gray-700 shadow-2xl flex flex-col"
        style={{ width: "90vw", height: "80vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-sm font-semibold text-green-400 font-mono">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-lg px-2"
          >
            x
          </button>
        </div>
        <div
          ref={ref}
          className="flex-1 overflow-y-auto p-4 text-green-400 text-sm font-mono"
        >
          {lines.length === 0 ? (
            <div className="text-gray-500 animate-pulse">
              Waiting for logs...
            </div>
          ) : (
            lines.map((line, i) => (
              <div
                key={i}
                className={`whitespace-pre-wrap leading-6 py-px ${isFailureLine(line) ? "text-red-400 font-semibold" : ""}`}
              >
                {line}
              </div>
            ))
          )}
        </div>
        <div className="px-4 py-2 border-t border-gray-700 text-xs text-gray-500 font-mono">
          {lines.length} lines | Press Esc to close
        </div>
      </div>
    </div>
  );
}

export default function RunCard({
  run,
  stage,
  currentQuestion,
  totalQuestions,
  currentEntry,
  liveLogLines,
  selected,
  onSelect,
  onView,
  onDelete,
  onCancel,
}: RunCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const statusClass = statusStyles[run.status] || statusStyles.pending;
  const stageInfo = stage ? STAGE_LABELS[stage] : null;
  const isActive = run.status === "running" || run.status === "pending";
  const isFailed = run.status === "failed";
  const showLogPanel = isActive || isFailed;
  const logLines = isActive ? (liveLogLines || []) : (run.playwrightLog || []);

  const hasOverallScore = run.summary && typeof run.summary.avgOverallScore === "number";

  return (
    <>
      <div
        className={`bg-white rounded-xl border transition-all ${
          isActive
            ? "border-blue-200 shadow-sm ring-1 ring-blue-100"
            : selected
              ? "border-blue-400 shadow ring-1 ring-blue-200"
              : "border-gray-200 hover:shadow-md hover:border-gray-300"
        }`}
      >
        {/* Top section: header + badges */}
        <div className="p-4 pb-0">
          <div className="flex items-start gap-3">
            {/* Checkbox */}
            {onSelect && (
              <div className="pt-0.5 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={!!selected}
                  onChange={() => onSelect(run._id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
              </div>
            )}

            {/* Title + meta */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <h3 className="text-sm font-semibold text-gray-900 truncate">
                  {run.goldenSetName}
                </h3>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusClass}`}
                >
                  {run.status}
                </span>
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">
                {run.agentName && (
                  <span className="text-gray-500">{run.agentName}</span>
                )}
                {run.agentName && <span className="mx-1.5 text-gray-300">|</span>}
                {run.judgeModel}
                <span className="mx-1.5 text-gray-300">|</span>
                {new Date(run.createdAt).toLocaleString()}
              </p>
            </div>

            {/* Eval count + overall score badges */}
            {run.summary && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex flex-col items-center justify-center w-14 h-14 bg-indigo-50 border border-indigo-100 rounded-xl">
                  <span className="text-xl font-bold text-indigo-600 leading-none">
                    {run.summary.completedQuestions}
                  </span>
                  <span className="text-[9px] font-semibold text-indigo-400 uppercase tracking-wider mt-0.5">
                    evals
                  </span>
                </div>
                {hasOverallScore && (
                  <div
                    className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br ${overallGradient(run.summary!.avgOverallScore)} text-white shadow-sm`}
                  >
                    <span className="text-xl font-bold leading-none">
                      {run.summary!.avgOverallScore.toFixed(1)}
                    </span>
                    <span className="text-[9px] font-semibold opacity-80 uppercase tracking-wider mt-0.5">
                      score
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Live stage indicator */}
        {isActive && stageInfo && (
          <div className="mx-4 mt-3 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-center gap-2 text-sm text-blue-800">
              <span>{stageInfo.icon}</span>
              <span className="font-medium">{stageInfo.label}</span>
            </div>
            {currentQuestion != null && totalQuestions != null && (
              <p className="text-xs text-blue-600 mt-1">
                Question {currentQuestion} of {totalQuestions}
              </p>
            )}
            {currentEntry && (
              <p className="text-xs text-blue-400 mt-0.5 truncate italic">
                &ldquo;{currentEntry}&rdquo;
              </p>
            )}
          </div>
        )}

        {/* Progress bar */}
        {run.status === "running" && (
          <div className="mx-4 mt-3">
            <div className="flex justify-between text-xs text-gray-400 mb-1">
              <span>
                {currentQuestion && totalQuestions
                  ? `${currentQuestion} / ${totalQuestions} questions`
                  : "Progress"}
              </span>
              <span className="font-medium text-gray-600">{run.progress}%</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${run.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Completed scores */}
        {run.summary && run.status === "completed" && (
          <div className="mx-4 mt-3 grid grid-cols-4 gap-1.5">
            {[
              { label: "Correct", value: run.summary.avgCorrectness },
              { label: "Complete", value: run.summary.avgCompleteness },
              { label: "Relevant", value: run.summary.avgRelevance },
              { label: "Faithful", value: run.summary.avgFaithfulness },
            ].map(({ label, value }) => (
              <div
                key={label}
                className={`text-center py-1.5 rounded-lg border ${scoreBg(value)}`}
              >
                <div className={`text-base font-bold ${scoreColor(value)}`}>
                  {value.toFixed(1)}
                </div>
                <div className="text-[9px] text-gray-400 font-semibold uppercase tracking-wider">{label}</div>
              </div>
            ))}
          </div>
        )}

        {run.error && (
          <p className="mx-4 mt-2 text-xs text-red-500 bg-red-50 rounded-lg px-2.5 py-1.5 border border-red-100">
            {run.error}
          </p>
        )}

        {/* Live log terminal */}
        {showLogPanel && (
          <div className="mx-4 mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-600">
                Playwright Log
                {logLines.length > 0 && (
                  <span className="text-gray-300 ml-1">({logLines.length})</span>
                )}
              </span>
              <button
                onClick={() => setModalOpen(true)}
                className="text-xs font-medium text-blue-500 hover:text-blue-700 hover:underline"
              >
                Full Log
              </button>
            </div>
            <LogTerminal lines={logLines} maxHeight="200px" />
          </div>
        )}

        {/* Completed — log link */}
        {run.status === "completed" &&
          run.playwrightLog &&
          run.playwrightLog.length > 0 && (
            <div className="mx-4 mt-2">
              <button
                onClick={() => setModalOpen(true)}
                className="text-xs font-medium text-gray-400 hover:text-blue-600 hover:underline transition-colors"
              >
                View Playwright Log ({run.playwrightLog.length} lines)
              </button>
            </div>
          )}

        {/* Actions */}
        <div className="p-4 pt-3 flex gap-2">
          {run.status === "completed" && (
            <button
              onClick={() => onView(run._id)}
              className="flex-1 text-xs font-medium bg-blue-600 text-white rounded-lg px-3 py-2 hover:bg-blue-700 transition-colors"
            >
              View Results
            </button>
          )}
          {run.status === "running" && onCancel && (
            <button
              onClick={() => onCancel(run._id)}
              className="flex-1 text-xs font-medium bg-amber-500 text-white rounded-lg px-3 py-2 hover:bg-amber-600 transition-colors"
            >
              Cancel
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(run._id)}
              className="text-xs font-medium text-red-500 border border-red-200 rounded-lg px-3 py-2 hover:bg-red-50 transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Full-screen log modal */}
      {modalOpen && (
        <LogModal
          title={`Playwright Log — ${run.goldenSetName} (${run.agentName || "agent"})`}
          lines={logLines}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
