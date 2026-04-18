"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";
import ResultsTable from "@/components/ResultsTable";
import { ScoreRadar, LanguageBarChart } from "@/components/ScoreChart";
import {
  getRun,
  getRunResults,
  getRunStats,
  exportRunCsv,
  deleteResult,
  getScoreProfiles,
  assignScoreProfileToRun,
  retryResults,
  subscribeToRunProgress,
  ALL_SCORE_CRITERIA,
} from "@/lib/api";
import { isRtlLanguage } from "@/lib/rtl";
import type {
  EvaluationRunData,
  EvaluationResultData,
  LanguageStat,
  ScoreProfile,
  ScoreCriterion,
  RunProgress,
} from "@/lib/api";

type ResultTab = "scored" | "knowledge_gap" | "error";

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
  const [resultTab, setResultTab] = useState<ResultTab>("scored");
  const [profiles, setProfiles] = useState<ScoreProfile[]>([]);
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState(false);
  const [retryProgress, setRetryProgress] = useState<RunProgress | null>(null);
  const retryUnsubRef = useRef<(() => void) | null>(null);
  const [expandedGapRow, setExpandedGapRow] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [runData, resultsData, statsData, profilesData] = await Promise.all([
        getRun(runId),
        getRunResults(runId, {
          language: filterLang || undefined,
          category: filterCategory || undefined,
        }),
        getRunStats(runId),
        getScoreProfiles().catch(() => [] as ScoreProfile[]),
      ]);
      setRun(runData);
      setResults(resultsData);
      setStats(statsData);
      setProfiles(profilesData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [runId, filterLang, filterCategory]);

  useEffect(() => {
    return () => {
      if (retryUnsubRef.current) retryUnsubRef.current();
    };
  }, []);

  const handleDeleteResult = async (resultId: string) => {
    await deleteResult(resultId);
    await fetchData();
  };

  const activeProfile: ScoreProfile | null = useMemo(() => {
    if (!profiles.length) return null;
    if (run?.scoreProfileId) {
      const match = profiles.find((p) => p._id === run.scoreProfileId);
      if (match) return match;
    }
    return profiles.find((p) => p.isDefault) ?? profiles[0];
  }, [profiles, run?.scoreProfileId]);

  const enabledCriteria: ScoreCriterion[] = activeProfile
    ? activeProfile.enabledCriteria
    : ALL_SCORE_CRITERIA;

  const handleProfileChange = async (profileId: string) => {
    try {
      await assignScoreProfileToRun(runId, profileId);
      await fetchData();
    } catch (e) {
      console.error("Failed to change profile:", e);
    }
  };

  const scoredResults = results.filter((r) => (r.resultType ?? "scored") === "scored");
  const knowledgeGapResults = results.filter((r) => r.resultType === "knowledge_gap");
  const errorResults = results.filter((r) => r.resultType === "error");

  // Recompute display-side averages based on selected enabledCriteria
  const displayAverages = useMemo(() => {
    if (scoredResults.length === 0 || enabledCriteria.length === 0) {
      return {
        overall: null as number | null,
        byCriterion: {
          correctness: 0,
          completeness: 0,
          relevance: 0,
          faithfulness: 0,
        },
      };
    }
    const sums = { correctness: 0, completeness: 0, relevance: 0, faithfulness: 0 };
    let overallSum = 0;
    let overallCount = 0;
    for (const r of scoredResults) {
      if (!r.judgeScores) continue;
      sums.correctness += r.judgeScores.correctness.score;
      sums.completeness += r.judgeScores.completeness.score;
      sums.relevance += r.judgeScores.relevance.score;
      sums.faithfulness += r.judgeScores.faithfulness.score;
      let rowSum = 0;
      for (const c of enabledCriteria) rowSum += r.judgeScores[c].score;
      overallSum += rowSum / enabledCriteria.length;
      overallCount += 1;
    }
    const n = scoredResults.length;
    return {
      overall: overallCount ? overallSum / overallCount : null,
      byCriterion: {
        correctness: sums.correctness / n,
        completeness: sums.completeness / n,
        relevance: sums.relevance / n,
        faithfulness: sums.faithfulness / n,
      },
    };
  }, [scoredResults, enabledCriteria]);

  const toggleResultSelection = (id: string) => {
    setSelectedResultIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAllErrors = () => {
    if (selectedResultIds.size === errorResults.length && errorResults.length > 0) {
      setSelectedResultIds(new Set());
    } else {
      setSelectedResultIds(new Set(errorResults.map((r) => r._id)));
    }
  };

  const handleRetrySelected = async () => {
    if (selectedResultIds.size === 0) return;
    setRetrying(true);
    setRetryProgress(null);
    try {
      const unsub = subscribeToRunProgress(runId, (data) => {
        setRetryProgress(data);
        if (data.status === "completed" || data.status === "failed") {
          setTimeout(async () => {
            setRetrying(false);
            setSelectedResultIds(new Set());
            await fetchData();
            setRetryProgress(null);
          }, 400);
        }
      });
      retryUnsubRef.current = unsub;
      await retryResults(runId, Array.from(selectedResultIds));
    } catch (e) {
      console.error("Retry failed:", e);
      setRetrying(false);
      if (retryUnsubRef.current) {
        retryUnsubRef.current();
        retryUnsubRef.current = null;
      }
    }
  };

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
              {exporting ? "Downloading..." : "Download CSV"}
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
                    {displayAverages.overall !== null
                      ? displayAverages.overall.toFixed(2)
                      : "N/A"}
                    <span className="text-xs text-gray-400"> / 5</span>
                  </p>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Score Profile:</span>
                  <select
                    value={activeProfile?._id ?? ""}
                    onChange={(e) => handleProfileChange(e.target.value)}
                    disabled={profiles.length === 0}
                    className="border border-gray-300 rounded-md px-2 py-1 text-sm"
                  >
                    {profiles.length === 0 && (
                      <option value="">(none)</option>
                    )}
                    {profiles.map((p) => (
                      <option key={p._id} value={p._id}>
                        {p.name}
                        {p.isDefault ? " (default)" : ""}
                      </option>
                    ))}
                  </select>
                  <Link
                    href="/settings/score-profiles"
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Manage
                  </Link>
                </div>
                {activeProfile && (
                  <div className="flex flex-wrap gap-1">
                    {activeProfile.enabledCriteria.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-50 text-blue-700 capitalize"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
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
                    correctness={displayAverages.byCriterion.correctness}
                    completeness={displayAverages.byCriterion.completeness}
                    relevance={displayAverages.byCriterion.relevance}
                    faithfulness={displayAverages.byCriterion.faithfulness}
                    enabledCriteria={enabledCriteria}
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

            {/* Result type tabs */}
            <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
              <button
                onClick={() => setResultTab("scored")}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  resultTab === "scored"
                    ? "border-blue-600 text-blue-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Scored
                <span className={`ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  resultTab === "scored" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                }`}>
                  {scoredResults.length}
                </span>
              </button>
              <button
                onClick={() => setResultTab("knowledge_gap")}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  resultTab === "knowledge_gap"
                    ? "border-amber-600 text-amber-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Knowledge Gaps
                <span className={`ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  resultTab === "knowledge_gap" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
                }`}>
                  {knowledgeGapResults.length}
                </span>
              </button>
              <button
                onClick={() => setResultTab("error")}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  resultTab === "error"
                    ? "border-red-600 text-red-700"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                }`}
              >
                Errors
                <span className={`ml-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  resultTab === "error" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-500"
                }`}>
                  {errorResults.length}
                </span>
              </button>
            </div>

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

            {/* Scored tab */}
            {resultTab === "scored" && (
              <div className="bg-white rounded-lg border overflow-hidden">
                <ResultsTable
                  results={scoredResults}
                  onDelete={handleDeleteResult}
                  enabledCriteria={enabledCriteria}
                />
              </div>
            )}

            {/* Knowledge Gaps tab */}
            {resultTab === "knowledge_gap" && (
              <div className="bg-white rounded-lg border overflow-hidden">
                {knowledgeGapResults.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No knowledge gap results.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-amber-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-amber-700 uppercase tracking-wider w-12">#</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-amber-700 uppercase tracking-wider w-[22%]">Question</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-amber-700 uppercase tracking-wider w-[22%]">Expected Answer</th>
                          <th
                            className="px-4 py-3 text-center text-xs font-medium text-amber-700 uppercase tracking-wider w-24"
                            title="Knowledge Quality — how well the retrieved articles cover the expected answer (1 = poor, 5 = excellent)"
                          >
                            <span className="relative group inline-flex items-center gap-1 cursor-help">
                              Knowledge
                              <br />
                              Quality
                              <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-1 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-[11px] font-normal normal-case text-white opacity-0 group-hover:opacity-100 transition-opacity z-50">
                                How well the retrieved articles cover the expected answer (1–5)
                              </span>
                            </span>
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-amber-700 uppercase tracking-wider">Knowledge Gaps</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-amber-700 uppercase tracking-wider">Suggested Improvements</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-amber-700 uppercase tracking-wider">Retrieved Articles</th>
                          {handleDeleteResult && (
                            <th className="px-4 py-3 w-10"></th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {knowledgeGapResults.map((r) => {
                          const kq = r.judgeScores?.knowledgeQuality;
                          const isRtl = isRtlLanguage(r.language);
                          const kqScore = kq?.score;
                          const kqColor =
                            kqScore === undefined
                              ? "bg-gray-100 text-gray-600"
                              : kqScore >= 4
                              ? "bg-green-100 text-green-700"
                              : kqScore >= 3
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700";
                          const isExpanded = expandedGapRow === r._id;
                          const gapColCount = handleDeleteResult ? 8 : 7;
                          return (
                            <Fragment key={r._id}>
                            <tr
                              className="hover:bg-amber-50/30 align-top cursor-pointer"
                              onClick={() =>
                                setExpandedGapRow(isExpanded ? null : r._id)
                              }
                            >
                              <td className="px-4 py-3 text-sm text-gray-500">
                                <div className="flex items-center gap-1">
                                  <svg
                                    className={`w-3 h-3 text-gray-400 transition-transform ${
                                      isExpanded ? "rotate-90" : ""
                                    }`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                  {r.entryIndex + 1}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-900">
                                <div
                                  className="whitespace-pre-wrap break-words leading-snug"
                                  dir={isRtl ? "rtl" : "ltr"}
                                  title={r.question}
                                >
                                  {r.question}
                                </div>
                                <div className="mt-1 text-[11px] text-gray-400 uppercase">
                                  {r.language}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-600">
                                <div
                                  className="whitespace-pre-wrap break-words leading-snug"
                                  dir={isRtl ? "rtl" : "ltr"}
                                  title={r.expectedAnswer}
                                >
                                  {r.expectedAnswer}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${kqColor}`}
                                  title="Knowledge Quality score (1 = poor, 5 = excellent)"
                                >
                                  {kqScore ?? "—"}/5
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-amber-900 max-w-[250px]">
                                {kq?.gaps && kq.gaps.length > 0 ? (
                                  <ul className="space-y-1">
                                    {kq.gaps.map((g, i) => (
                                      <li key={i} className="flex items-start gap-1">
                                        <span className="text-amber-500 mt-px flex-shrink-0">&#x25B2;</span>
                                        <span>{g}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-emerald-900 max-w-[250px]">
                                {kq?.improvements && kq.improvements.length > 0 ? (
                                  <ul className="space-y-1">
                                    {kq.improvements.map((imp, i) => (
                                      <li key={i} className="flex items-start gap-1">
                                        <span className="text-emerald-500 mt-px flex-shrink-0">&#x2713;</span>
                                        <span>{imp}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-700 max-w-[250px]">
                                {r.searchKnowledge?.chunks && r.searchKnowledge.chunks.length > 0 ? (
                                  <ul className="space-y-1">
                                    {r.searchKnowledge.chunks.map((chunk, ci) => (
                                      <li key={ci} className="flex items-start gap-1">
                                        <span className="text-blue-400 mt-px flex-shrink-0">&#x25CF;</span>
                                        {chunk.url ? (
                                          <a
                                            href={chunk.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-600 hover:text-blue-800 hover:underline truncate"
                                            title={chunk.title}
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            {chunk.title}
                                          </a>
                                        ) : (
                                          <span className="truncate" title={chunk.title}>{chunk.title}</span>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-gray-400">No articles retrieved</span>
                                )}
                              </td>
                              {handleDeleteResult && (
                                <td className="px-2 py-3 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteResult(r._id);
                                    }}
                                    className="p-1 text-gray-300 hover:text-red-500 transition-colors"
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
                              <tr className="bg-amber-50/40">
                                <td colSpan={gapColCount} className="px-4 py-4">
                                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    <div>
                                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                                        Agent Answer
                                      </h4>
                                      <div
                                        className="text-sm text-gray-800 bg-white border border-gray-200 rounded p-3 whitespace-pre-wrap break-words"
                                        dir={isRtl ? "rtl" : "ltr"}
                                      >
                                        {r.actualAnswer?.trim() ? (
                                          r.actualAnswer
                                        ) : (
                                          <span className="text-gray-400 italic">
                                            (empty)
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div>
                                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                                        Expected Answer
                                      </h4>
                                      <div
                                        className="text-sm text-gray-800 bg-white border border-gray-200 rounded p-3 whitespace-pre-wrap break-words"
                                        dir={isRtl ? "rtl" : "ltr"}
                                      >
                                        {r.expectedAnswer}
                                      </div>
                                    </div>
                                  </div>
                                  {kq?.explanation && (
                                    <div className="mt-4">
                                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                                        Knowledge Quality — Judge Explanation
                                      </h4>
                                      <div className="text-sm text-gray-700 bg-white border border-amber-200 rounded p-3">
                                        {kq.explanation}
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
                )}
              </div>
            )}

            {/* Errors tab */}
            {resultTab === "error" && (
              <div className="bg-white rounded-lg border overflow-hidden">
                {errorResults.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">No error results.</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-4 py-3 bg-red-50/50 border-b">
                      <div className="text-sm text-gray-600">
                        {selectedResultIds.size > 0
                          ? `${selectedResultIds.size} selected`
                          : `${errorResults.length} error${errorResults.length === 1 ? "" : "s"}`}
                      </div>
                      <div className="flex items-center gap-2">
                        {retrying && retryProgress && (
                          <div className="flex items-center gap-2 mr-2">
                            <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-500 transition-all"
                                style={{ width: `${Math.max(0, Math.min(100, retryProgress.progress || 0))}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">
                              {retryProgress.stage || "running"} ({retryProgress.progress || 0}%)
                            </span>
                          </div>
                        )}
                        <button
                          onClick={handleRetrySelected}
                          disabled={selectedResultIds.size === 0 || retrying}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          {retrying
                            ? "Retrying..."
                            : `Retry Selected${selectedResultIds.size > 0 ? ` (${selectedResultIds.size})` : ""}`}
                        </button>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-red-50">
                          <tr>
                            <th className="px-4 py-3 w-10">
                              <input
                                type="checkbox"
                                className="h-4 w-4 text-blue-600 rounded"
                                checked={
                                  errorResults.length > 0 &&
                                  selectedResultIds.size === errorResults.length
                                }
                                onChange={toggleSelectAllErrors}
                                disabled={retrying}
                                aria-label="Select all"
                              />
                            </th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">#</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">Question</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-red-700 uppercase tracking-wider">Error Message</th>
                            <th className="px-4 py-3 w-10"></th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {errorResults.map((r) => (
                            <tr key={r._id} className="hover:bg-red-50/30">
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 text-blue-600 rounded"
                                  checked={selectedResultIds.has(r._id)}
                                  onChange={() => toggleResultSelection(r._id)}
                                  disabled={retrying}
                                  aria-label="Select row"
                                />
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">{r.entryIndex + 1}</td>
                              <td className="px-4 py-3 text-sm text-gray-900 max-w-[300px]">
                                <div className="truncate" title={r.question}>{r.question}</div>
                              </td>
                              <td className="px-4 py-3 text-sm text-red-700 max-w-[400px]">
                                <div className="whitespace-pre-wrap break-words">
                                  {r.errorMessage || r.actualAnswer || "Unknown error"}
                                </div>
                              </td>
                              <td className="px-2 py-3 text-center">
                                <button
                                  onClick={() => handleDeleteResult(r._id)}
                                  disabled={retrying}
                                  className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-30"
                                  title="Delete this result"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
    </ProtectedRoute>
  );
}
