"use client";

import type { EvaluationRunData } from "@/lib/api";

interface RunCardProps {
  run: EvaluationRunData;
  stage?: string;
  currentQuestion?: number;
  totalQuestions?: number;
  currentEntry?: string;
  onView: (runId: string) => void;
  onDelete: (runId: string) => void;
  onCancel?: (runId: string) => void;
}

const statusStyles: Record<string, string> = {
  pending: "bg-gray-100 text-gray-800",
  running: "bg-blue-100 text-blue-800 animate-pulse",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
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
  question_complete: { label: "Question done", icon: "✅" },
  question_error: { label: "Question failed", icon: "❌" },
  computing_summary: { label: "Computing summary", icon: "📊" },
  done: { label: "Complete", icon: "🎉" },
  cancelled: { label: "Cancelled", icon: "🚫" },
  error: { label: "Error", icon: "💥" },
};

export default function RunCard({
  run,
  stage,
  currentQuestion,
  totalQuestions,
  currentEntry,
  onView,
  onDelete,
  onCancel,
}: RunCardProps) {
  const statusClass = statusStyles[run.status] || statusStyles.pending;
  const stageInfo = stage ? STAGE_LABELS[stage] : null;
  const isActive = run.status === "running" || run.status === "pending";

  return (
    <div
      className={`bg-white rounded-lg border p-4 transition-shadow ${
        isActive ? "border-blue-300 shadow-sm" : "border-gray-200 hover:shadow-md"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-gray-900 truncate">
              {run.goldenSetName}
            </h3>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusClass}`}
            >
              {run.status}
            </span>
          </div>
          <p className="text-xs text-gray-500">
            Model: {run.judgeModel} &middot;{" "}
            {new Date(run.createdAt).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Live stage indicator for active runs */}
      {isActive && stageInfo && (
        <div className="mt-3 p-2 bg-blue-50 rounded-md">
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
            <p className="text-xs text-blue-500 mt-0.5 truncate italic">
              &ldquo;{currentEntry}&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Progress bar for running */}
      {run.status === "running" && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>
              {currentQuestion && totalQuestions
                ? `${currentQuestion} / ${totalQuestions} questions`
                : "Progress"}
            </span>
            <span>{run.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${run.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Summary scores for completed runs */}
      {run.summary && run.status === "completed" && (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {[
            { label: "Correctness", value: run.summary.avgCorrectness },
            { label: "Completeness", value: run.summary.avgCompleteness },
            { label: "Relevance", value: run.summary.avgRelevance },
            { label: "Faithfulness", value: run.summary.avgFaithfulness },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-lg font-semibold text-gray-900">
                {value.toFixed(1)}
              </div>
              <div className="text-xs text-gray-500">{label}</div>
            </div>
          ))}
        </div>
      )}

      {run.error && (
        <p className="mt-2 text-xs text-red-600 truncate">
          Error: {run.error}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        {run.status === "completed" && (
          <button
            onClick={() => onView(run._id)}
            className="flex-1 text-xs bg-blue-600 text-white rounded px-3 py-1.5 hover:bg-blue-700 transition-colors"
          >
            View Results
          </button>
        )}
        {run.status === "running" && onCancel && (
          <button
            onClick={() => onCancel(run._id)}
            className="flex-1 text-xs bg-yellow-500 text-white rounded px-3 py-1.5 hover:bg-yellow-600 transition-colors"
          >
            Cancel
          </button>
        )}
        <button
          onClick={() => onDelete(run._id)}
          className="text-xs text-red-600 border border-red-200 rounded px-3 py-1.5 hover:bg-red-50 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
