"use client";

import { useEffect, useState } from "react";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import { ScoreRadar, LanguageBarChart } from "@/components/ScoreChart";
import { getRuns, getGoldenSets } from "@/lib/api";
import type { EvaluationRunData, GoldenSetSummary } from "@/lib/api";

export default function DashboardPage() {
  const [runs, setRuns] = useState<EvaluationRunData[]>([]);
  const [goldenSets, setGoldenSets] = useState<GoldenSetSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getRuns(), getGoldenSets()])
      .then(([r, g]) => {
        setRuns(r);
        setGoldenSets(g);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const completedRuns = runs.filter((r) => r.status === "completed");
  const latestRun = completedRuns[0];

  const langData = latestRun?.summary?.byLanguage
    ? Object.entries(latestRun.summary.byLanguage).map(([lang, data]) => ({
        language: lang.toUpperCase(),
        avgOverall: data.avgOverallScore,
        count: data.count,
      }))
    : [];

  return (
    <ProtectedRoute>
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

        {loading ? (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        ) : (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                label="Golden Sets"
                value={goldenSets.length}
                sub="uploaded"
              />
              <StatCard
                label="Total Runs"
                value={runs.length}
                sub={`${completedRuns.length} completed`}
              />
              <StatCard
                label="Latest Score"
                value={
                  latestRun?.summary?.avgOverallScore?.toFixed(1) || "N/A"
                }
                sub="overall average"
              />
              <StatCard
                label="Total Questions"
                value={goldenSets.reduce((s, g) => s + g.entryCount, 0)}
                sub="across all sets"
              />
            </div>

            {/* Charts */}
            {latestRun?.summary && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg border p-6">
                  <h2 className="text-sm font-semibold text-gray-700 mb-4">
                    Latest Run - Score Breakdown
                  </h2>
                  <ScoreRadar
                    correctness={latestRun.summary.avgCorrectness}
                    completeness={latestRun.summary.avgCompleteness}
                    relevance={latestRun.summary.avgRelevance}
                    faithfulness={latestRun.summary.avgFaithfulness}
                  />
                </div>
                {langData.length > 0 && (
                  <div className="bg-white rounded-lg border p-6">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">
                      Scores by Language
                    </h2>
                    <LanguageBarChart data={langData} />
                  </div>
                )}
              </div>
            )}

            {!latestRun && (
              <div className="bg-white rounded-lg border p-12 text-center">
                <p className="text-gray-500 mb-2">
                  No evaluation runs completed yet.
                </p>
                <p className="text-sm text-gray-400">
                  Upload a golden set and start an evaluation run to see
                  results.
                </p>
              </div>
            )}
          </>
        )}
      </main>
    </div>
    </ProtectedRoute>
  );
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  );
}
