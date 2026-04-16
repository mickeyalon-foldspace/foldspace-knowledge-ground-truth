"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import ResultsTable from "@/components/ResultsTable";
import { ScoreRadar, LanguageBarChart } from "@/components/ScoreChart";
import { getRun, getRunResults, getRunStats, exportRunCsv } from "@/lib/api";
import type {
  EvaluationRunData,
  EvaluationResultData,
  LanguageStat,
} from "@/lib/api";

export default function RunDetailPage() {
  const params = useParams();
  const runId = params.runId as string;

  const [run, setRun] = useState<EvaluationRunData | null>(null);
  const [results, setResults] = useState<EvaluationResultData[]>([]);
  const [stats, setStats] = useState<LanguageStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLang, setFilterLang] = useState<string>("");
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  const fetchData = async () => {
    try {
      const [runData, resultsData, statsData] = await Promise.all([
        getRun(runId),
        getRunResults(runId, {
          language: filterLang || undefined,
          category: filterCategory || undefined,
        }),
        getRunStats(runId),
      ]);
      setRun(runData);
      setResults(resultsData);
      setStats(statsData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [runId, filterLang, filterCategory]);

  const languages = [...new Set(results.map((r) => r.language))];
  const categories = [
    ...new Set(results.map((r) => r.category).filter(Boolean)),
  ];

  const langChartData = stats.map((s) => ({
    language: s._id.toUpperCase(),
    avgOverall: parseFloat(s.avgOverall.toFixed(2)),
    count: s.count,
  }));

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Link
              href="/runs"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              Runs
            </Link>
            <span className="text-gray-400">/</span>
            <h1 className="text-2xl font-bold text-gray-900">
              {run?.goldenSetName || "Run Details"}
            </h1>
          </div>
          {run?.status === "completed" && results.length > 0 && (
            <button
              onClick={async () => {
                setExporting(true);
                try {
                  await exportRunCsv(runId);
                } catch (e) {
                  console.error("Export failed:", e);
                } finally {
                  setExporting(false);
                }
              }}
              disabled={exporting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {exporting ? "Exporting..." : "Export CSV for Google Sheets"}
            </button>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : !run ? (
          <div className="text-center py-12 text-gray-500">Run not found.</div>
        ) : (
          <>
            {/* Run info */}
            <div className="bg-white rounded-lg border p-4 mb-6">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">Status</span>
                  <p className="font-medium capitalize">{run.status}</p>
                </div>
                <div>
                  <span className="text-gray-500">Agent</span>
                  <p className="font-medium">{run.agentName || "—"}</p>
                </div>
                <div>
                  <span className="text-gray-500">Executed</span>
                  <p className="font-medium">
                    {run.startedAt
                      ? new Date(run.startedAt).toLocaleString()
                      : new Date(run.createdAt).toLocaleString()}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Judge Model</span>
                  <p className="font-medium">{run.judgeModel}</p>
                </div>
                <div>
                  <span className="text-gray-500">Questions</span>
                  <p className="font-medium">
                    {run.summary?.totalQuestions || results.length}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">Overall Score</span>
                  <p className="font-medium text-lg">
                    {run.summary?.avgOverallScore?.toFixed(2) || "N/A"}
                    <span className="text-xs text-gray-400"> / 5</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Charts */}
            {run.summary && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <div className="bg-white rounded-lg border p-6">
                  <h2 className="text-sm font-semibold text-gray-700 mb-4">
                    Score Breakdown
                  </h2>
                  <ScoreRadar
                    correctness={run.summary.avgCorrectness}
                    completeness={run.summary.avgCompleteness}
                    relevance={run.summary.avgRelevance}
                    faithfulness={run.summary.avgFaithfulness}
                  />
                </div>
                {langChartData.length > 0 && (
                  <div className="bg-white rounded-lg border p-6">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">
                      Scores by Language
                    </h2>
                    <LanguageBarChart data={langChartData} />
                  </div>
                )}
              </div>
            )}

            {/* Per-language stats table */}
            {stats.length > 0 && (
              <div className="bg-white rounded-lg border p-4 mb-6 overflow-x-auto">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">
                  Language Statistics
                </h2>
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 text-xs text-gray-500">
                        Language
                      </th>
                      <th className="text-center py-2 px-2 text-xs text-gray-500">
                        Count
                      </th>
                      <th className="text-center py-2 px-2 text-xs text-gray-500">
                        Correct
                      </th>
                      <th className="text-center py-2 px-2 text-xs text-gray-500">
                        Complete
                      </th>
                      <th className="text-center py-2 px-2 text-xs text-gray-500">
                        Relevant
                      </th>
                      <th className="text-center py-2 px-2 text-xs text-gray-500">
                        Faithful
                      </th>
                      <th className="text-center py-2 px-2 text-xs text-gray-500">
                        Overall
                      </th>
                      <th className="text-center py-2 px-2 text-xs text-gray-500">
                        Lang Match
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((s) => (
                      <tr
                        key={s._id}
                        className="border-b border-gray-100 hover:bg-gray-50"
                      >
                        <td className="py-2 px-2 uppercase font-medium">
                          {s._id}
                        </td>
                        <td className="py-2 px-2 text-center">{s.count}</td>
                        <td className="py-2 px-2 text-center">
                          {s.avgCorrectness.toFixed(1)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {s.avgCompleteness.toFixed(1)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {s.avgRelevance.toFixed(1)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {s.avgFaithfulness.toFixed(1)}
                        </td>
                        <td className="py-2 px-2 text-center font-semibold">
                          {s.avgOverall.toFixed(1)}
                        </td>
                        <td className="py-2 px-2 text-center">
                          {(s.languageMatchRate * 100).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <select
                value={filterLang}
                onChange={(e) => setFilterLang(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
              >
                <option value="">All Languages</option>
                {languages.map((l) => (
                  <option key={l} value={l}>
                    {l.toUpperCase()}
                  </option>
                ))}
              </select>
              {categories.length > 0 && (
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                >
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c!}>
                      {c}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Results table */}
            <div className="bg-white rounded-lg border overflow-hidden">
              <ResultsTable results={results} />
            </div>
          </>
        )}
      </main>
    </div>
    </ProtectedRoute>
  );
}
