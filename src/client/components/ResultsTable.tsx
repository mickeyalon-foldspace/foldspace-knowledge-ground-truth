"use client";

import { useState } from "react";
import type { EvaluationResultData } from "@/lib/api";
import { isRtlLanguage } from "@/lib/rtl";
import { ScoreBadge } from "./ScoreChart";
import ArticlesPanel from "./ArticlesPanel";

interface ResultsTableProps {
  results: EvaluationResultData[];
}

export default function ResultsTable({ results }: ResultsTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  if (results.length === 0) {
    return (
      <p className="text-sm text-gray-500 text-center py-8">
        No results found.
      </p>
    );
  }

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
              Chunks
            </th>
            <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
              Time
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {results.map((result) => {
            const isExpanded = expandedRow === result._id;
            const isRtl = isRtlLanguage(result.language);

            return (
              <Fragment key={result._id}>
                <tr
                  onClick={() =>
                    setExpandedRow(isExpanded ? null : result._id)
                  }
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
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
                    {!result.judgeScores.languageMatch && (
                      <span className="ml-1 text-red-500" title="Language mismatch">
                        !
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={result.judgeScores.correctness.score} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={result.judgeScores.completeness.score} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={result.judgeScores.relevance.score} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={result.judgeScores.faithfulness.score} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <ScoreBadge score={result.judgeScores.overallScore} />
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">
                    {(result.searchKnowledge?.chunks?.length || 0) > 0 ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        {result.searchKnowledge!.chunks.length}
                      </span>
                    ) : (
                      <span className="text-gray-300">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500">
                    {(result.responseTimeMs / 1000).toFixed(1)}s
                  </td>
                </tr>
                {isExpanded && (
                  <tr>
                    <td colSpan={11} className="px-4 py-4 bg-gray-50">
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
                                ({result.judgeScores[criterion].score}/5):{" "}
                                {result.judgeScores[criterion].explanation}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <ArticlesPanel
                            searchKnowledge={result.searchKnowledge}
                          />
                        </div>
                      </div>
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

// Need to import Fragment
import { Fragment } from "react";
