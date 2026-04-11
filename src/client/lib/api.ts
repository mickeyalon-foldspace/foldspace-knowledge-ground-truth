const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// Golden Sets
export async function getGoldenSets() {
  return request<GoldenSetSummary[]>("/golden-sets");
}

export async function getGoldenSet(id: string) {
  return request<GoldenSetFull>(`/golden-sets/${id}`);
}

export async function uploadGoldenSet(file: File, name?: string, description?: string) {
  const formData = new FormData();
  formData.append("file", file);
  if (name) formData.append("name", name);
  if (description) formData.append("description", description);

  return request<{ id: string; name: string; entryCount: number }>("/golden-sets/upload", {
    method: "POST",
    body: formData,
  });
}

export async function previewGoldenSet(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request<PreviewResult>("/golden-sets/preview", {
    method: "POST",
    body: formData,
  });
}

export async function saveGoldenSet(
  name: string,
  description: string,
  entries: GoldenSetEntry[],
  sourceFormat: string
) {
  return request<{ id: string; name: string; entryCount: number; languages: string[] }>(
    "/golden-sets/save",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, entries, sourceFormat }),
    }
  );
}

export async function deleteGoldenSet(id: string) {
  return request<{ message: string }>(`/golden-sets/${id}`, { method: "DELETE" });
}

// Runs
export async function getRuns() {
  return request<EvaluationRunData[]>("/runs");
}

export async function getRun(id: string) {
  return request<EvaluationRunData>(`/runs/${id}`);
}

export async function startRun(
  goldenSetId: string,
  judgeModel?: string,
  entryIndices?: number[]
) {
  return request<EvaluationRunData>("/runs/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goldenSetId, judgeModel, entryIndices }),
  });
}

export async function cancelRun(id: string) {
  return request<{ message: string }>(`/runs/${id}/cancel`, { method: "POST" });
}

export async function deleteRun(id: string) {
  return request<{ message: string }>(`/runs/${id}`, { method: "DELETE" });
}

// Results
export async function getRunResults(runId: string, filters?: ResultFilters) {
  const params = new URLSearchParams();
  if (filters?.language) params.set("language", filters.language);
  if (filters?.category) params.set("category", filters.category);
  if (filters?.minScore !== undefined) params.set("minScore", String(filters.minScore));
  if (filters?.maxScore !== undefined) params.set("maxScore", String(filters.maxScore));

  const query = params.toString();
  return request<EvaluationResultData[]>(`/results/run/${runId}${query ? `?${query}` : ""}`);
}

export async function getRunStats(runId: string) {
  return request<LanguageStat[]>(`/results/run/${runId}/stats`);
}

export async function getResultDetail(id: string) {
  return request<EvaluationResultData>(`/results/${id}`);
}

// SSE for run progress
export function subscribeToRunProgress(
  runId: string,
  onProgress: (data: RunProgress) => void
): () => void {
  const es = new EventSource(`${API_BASE}/runs/${runId}/progress`);
  es.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onProgress(data);
  };
  es.onerror = () => {
    es.close();
  };
  return () => es.close();
}

// Types
export interface GoldenSetSummary {
  _id: string;
  name: string;
  description?: string;
  sourceFormat: string;
  entryCount: number;
  createdAt: string;
}

export interface GoldenSetEntry {
  question: string;
  expectedAnswer: string;
  language: string;
  category?: string;
  topic?: string;
  expectedArticles?: string[];
}

export interface GoldenSetFull extends GoldenSetSummary {
  entries: GoldenSetEntry[];
}

export interface PreviewResult {
  entries: GoldenSetEntry[];
  sourceFormat: string;
  languages: string[];
}

export interface RunSummary {
  totalQuestions: number;
  completedQuestions: number;
  avgCorrectness: number;
  avgCompleteness: number;
  avgRelevance: number;
  avgFaithfulness: number;
  avgOverallScore: number;
  byLanguage: Record<string, { count: number; avgOverallScore: number }>;
}

export interface EvaluationRunData {
  _id: string;
  goldenSetId: string;
  goldenSetName: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  judgeModel: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  summary?: RunSummary;
  createdAt: string;
}

export interface JudgeScoreDetail {
  score: number;
  explanation: string;
}

export interface JudgeScores {
  correctness: JudgeScoreDetail;
  completeness: JudgeScoreDetail;
  relevance: JudgeScoreDetail;
  faithfulness: JudgeScoreDetail;
  overallScore: number;
  detectedLanguage: string;
  languageMatch: boolean;
}

export interface RetrievedArticle {
  title: string;
  chunkCount: number;
  chunks: Array<{ content: string; metadata?: Record<string, unknown> }>;
}

export interface EvaluationResultData {
  _id: string;
  runId: string;
  entryIndex: number;
  question: string;
  expectedAnswer: string;
  actualAnswer: string;
  language: string;
  category?: string;
  topic?: string;
  judgeScores: JudgeScores;
  retrievedArticles: RetrievedArticle[];
  responseTimeMs: number;
  createdAt: string;
}

export interface ResultFilters {
  language?: string;
  category?: string;
  minScore?: number;
  maxScore?: number;
}

export interface RunProgress {
  runId: string;
  status: string;
  progress: number;
  stage?: string;
  currentQuestion?: number;
  totalQuestions?: number;
  currentEntry?: string;
  error?: string;
}

export interface LanguageStat {
  _id: string;
  count: number;
  avgCorrectness: number;
  avgCompleteness: number;
  avgRelevance: number;
  avgFaithfulness: number;
  avgOverall: number;
  avgResponseTime: number;
  languageMatchRate: number;
}
