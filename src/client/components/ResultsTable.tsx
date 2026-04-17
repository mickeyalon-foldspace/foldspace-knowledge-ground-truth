"use client";

import { Fragment, useState } from "react";
import type { EvaluationResultData } from "@/lib/api";
import { isRtlLanguage } from "@/lib/rtl";
import { ScoreBadge } from "./ScoreChart";
import ArticlesPanel from "./ArticlesPanel";

interface ResultsTableProps {
  results: EvaluationResultData[];
  onDelete?: (id: string) => void;
}

export default function ResultsTable({ results, onDelete }: ResultsTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  if (results.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">
        No results found.
      </p>
    );
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!onDelete) return;
    if (!confirm("Delete this result? The run scores will be recalculated.")) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              #
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Question
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Expected Answer
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Lang
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Correct
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Complete
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Relevant
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Faithful
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Overall
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Articles
            </th>
            {onDelete && (
              <th className="px-4 py-3 w-10"></th>
            )}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {results.map((result) => {
            const isExpanded = expandedRow === result._id;
            const isRtl = isRtlLanguage(result.language);
            const isDeleting = deletingId === result._id;
            const colCount = onDelete ? 11 : 10;
            const uniqueArticles = new Set(
              (result.searchKnowledge?.chunks || []).map((c) => c.title)
            );

            return (
              <Fragment key={result._id}>
                <tr
                  onClick={() =>
                    setExpandedRow(isExpanded ? null : result._id)
                  }
                  className={`hover:bg-gray-50 cursor-pointer transition-colors ${isDeleting ? "opacity-40" : ""}`}
                >
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {result.entryIndex + 1}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-gray-900 max-w-[200px] truncate"
                    dir={isRtl ? "rtl" : "ltr"}
                    title={result.question}
                  >
                    {result.question}
                  </td>
                  <td
                    className="px-4 py-3 text-sm text-gray-500 max-w-[200px] truncate"
                    dir={isRtl ? "rtl" : "ltr"}
                    title={result.expectedAnswer}
                  >
                    {result.expectedAnswer.length > 60
                      ? result.expectedAnswer.substring(0, 60) + "..."
                      : result.expectedAnswer}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 uppercase">
                    {result.language}
                    {result.judgeScores && !result.judgeScores.languageMatch && (
                      <span className="ml-1 text-red-500" title="Language mismatch">
                        !
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={result.judgeScores?.correctness.score ?? 0} label="Correctness" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={result.judgeScores?.completeness.score ?? 0} label="Completeness" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={result.judgeScores?.relevance.score ?? 0} label="Relevance" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={result.judgeScores?.faithfulness.score ?? 0} label="Faithfulness" />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={result.judgeScores?.overallScore ?? 0} label="Overall" />
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">
                    {uniqueArticles.size > 0 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        {uniqueArticles.size}
                      </span>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                  {onDelete && (
                    <td className="px-2 py-3 text-center">
                      <button
                        onClick={(e) => handleDelete(e, result._id)}
                        disabled={isDeleting}
                        className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30"
                        title="Delete this result"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </td>
                  )}
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={colCount} className="px-4 py-4 bg-gray-50">
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-1">
                            Expected Answer
                          </h4>
                          <p
                            className="text-sm text-gray-600 bg-white p-3 rounded border whitespace-pre-wrap"
                            dir={isRtl ? "rtl" : "ltr"}
                          >
                            {result.expectedAnswer}
                          </p>
                        </div>
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-1">
                            Actual Answer
                          </h4>
                          <p
                            className="text-sm text-gray-600 bg-white p-3 rounded border whitespace-pre-wrap"
                            dir={isRtl ? "rtl" : "ltr"}
                          >
                            {result.actualAnswer}
                          </p>
                        </div>
                        {result.judgeScores && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 mb-2">
                            Judge Explanations
                          </h4>
                          <div className="space-y-2 text-xs">
                            {(
                              [
                                "correctness",
                                "completeness",
                                "relevance",
                                "faithfulness",
                              ] as const
                            ).map((criterion) => (
                              <div
                                key={criterion}
                                className="bg-white p-2 rounded border"
                              >
                                <span className="font-medium capitalize">
                                  {criterion}
                                </span>{" "}
                                ({result.judgeScores![criterion].score}/5):{" "}
                                {result.judgeScores![criterion].explanation}
                              </div>
                            ))}
                          </div>
                        </div>
                        )}

                        <div>
                          <ArticlesPanel
                            searchKnowledge={result.searchKnowledge}
                          />
                        </div>
                      </div>
                      {result.judgeScores?.knowledgeQuality && (result.judgeScores.knowledgeQuality.gaps.length > 0 || result.judgeScores.knowledgeQuality.improvements.length > 0) && (
                        <div className="mt-4 border border-amber-200 bg-amber-50/50 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <h4 className="text-sm font-semibold text-gray-800">
                              Knowledge Recommendations
                            </h4>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              result.judgeScores.knowledgeQuality.score >= 4 ? "bg-green-100 text-green-700" :
                              result.judgeScores.knowledgeQuality.score >= 3 ? "bg-yellow-100 text-yellow-700" :
                              "bg-red-100 text-red-700"
                            }`}>
                              {result.judgeScores.knowledgeQuality.score}/5
                            </span>
                          </div>
                          {result.judgeScores.knowledgeQuality.explanation && (
                            <p className="text-xs text-gray-600 mb-3">
                              {result.judgeScores.knowledgeQuality.explanation}
                            </p>
                          )}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {result.judgeScores.knowledgeQuality.gaps.length > 0 && (
                              <div>
                                <h5 className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1.5">
                                  Gaps in Knowledge
                                </h5>
                                <ul className="space-y-1">
                                  {result.judgeScores.knowledgeQuality.gaps.map((gap, gi) => (
                                    <li key={gi} className="flex items-start gap-1.5 text-xs text-amber-900 bg-white rounded border border-amber-200 px-2.5 py-1.5">
                                      <span className="text-amber-500 mt-px flex-shrink-0">&#x25B2;</span>
                                      {gap}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {result.judgeScores.knowledgeQuality.improvements.length > 0 && (
                              <div>
                                <h5 className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1.5">
                                  Suggested Improvements
                                </h5>
                                <ul className="space-y-1">
                                  {result.judgeScores.knowledgeQuality.improvements.map((imp, ii) => (
                                    <li key={ii} className="flex items-start gap-1.5 text-xs text-emerald-900 bg-white rounded border border-emerald-200 px-2.5 py-1.5">
                                      <span className="text-emerald-500 mt-px flex-shrink-0">&#x2713;</span>
                                      {imp}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
