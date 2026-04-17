import { auth } from "./firebase";

const API_BASE =
  typeof window !== "undefined"
    ? `${window.location.origin}/api`
    : "/api";

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...authHeaders,
      ...options?.headers,
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      window.location.href = "/login";
      throw new Error("Session expired");
    }
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

// Auth
export async function authSignup(orgName: string) {
  return request<{ user: AppUserData; organization: OrgData }>("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orgName }),
  });
}

export async function authJoin(inviteId: string) {
  return request<{ user: AppUserData; organization: OrgData }>("/auth/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ inviteId }),
  });
}

export async function getUsers() {
  return request<UserListItem[]>("/users");
}

export async function updateUserRole(userId: string, role: string) {
  return request<UserListItem>(`/users/${userId}/role`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export async function removeUser(userId: string) {
  return request<{ message: string }>(`/users/${userId}`, { method: "DELETE" });
}

export async function getInvites() {
  return request<InviteData[]>("/invites");
}

export async function createInvite(email: string, role: string) {
  return request<InviteData>("/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role }),
  });
}

export async function revokeInvite(id: string) {
  return request<{ message: string }>(`/invites/${id}`, { method: "DELETE" });
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

// Agents
export async function getAgents() {
  return request<AgentData[]>("/agents");
}

export async function createAgent(data: AgentFormData) {
  return request<AgentData>("/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function updateAgent(id: string, data: Partial<AgentFormData>) {
  return request<AgentData>(`/agents/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function deleteAgent(id: string) {
  return request<{ message: string }>(`/agents/${id}`, { method: "DELETE" });
}

export async function testAgentAuth(id: string) {
  return request<{ success: boolean; message: string }>(`/agents/${id}/test-auth`, {
    method: "POST",
  });
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
  agentId: string,
  judgeModel?: string,
  entryIndices?: number[]
) {
  return request<EvaluationRunData>("/runs/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goldenSetId, agentId, judgeModel, entryIndices }),
  });
}

export async function cancelRun(id: string) {
  return request<{ message: string }>(`/runs/${id}/cancel`, { method: "POST" });
}

export async function deleteRun(id: string) {
  return request<{ message: string }>(`/runs/${id}`, { method: "DELETE" });
}

export async function bulkDeleteRuns(ids: string[]) {
  return request<{ message: string }>("/runs/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
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

export async function deleteResult(id: string) {
  return request<{ message: string; runId: string }>(`/results/${id}`, {
    method: "DELETE",
  });
}

export async function exportRunCsv(runId: string): Promise<void> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/results/run/${runId}/export-csv`, {
    headers: authHeaders,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Export failed: ${res.status}`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `evaluation-run-${runId}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function getResultDetail(id: string) {
  return request<EvaluationResultData>(`/results/${id}`);
}

// SSE for run progress — EventSource can't set headers, so pass token as query param
export function subscribeToRunProgress(
  runId: string,
  onProgress: (data: RunProgress) => void
): () => void {
  let es: EventSource | null = null;

  (async () => {
    const { getAuth } = await import("firebase/auth");
    const auth = getAuth();
    const token = await auth.currentUser?.getIdToken();
    const url = `${API_BASE}/runs/${runId}/progress${token ? `?token=${encodeURIComponent(token)}` : ""}`;
    es = new EventSource(url);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onProgress(data);
      } catch { /* ignore parse errors */ }
    };
    es.onerror = () => {
      console.warn(`SSE connection error for run ${runId}`);
    };
  })();

  return () => { if (es) es.close(); };
}

// Types
export interface AppUserData {
  _id: string;
  firebaseUid: string;
  email: string;
  displayName: string;
  orgId: string;
  role: "admin" | "viewer";
}

export interface OrgData {
  _id: string;
  name: string;
}

export interface UserListItem {
  _id: string;
  email: string;
  displayName: string;
  role: "admin" | "viewer";
  createdAt: string;
}

export interface InviteData {
  _id: string;
  email: string;
  orgId: string;
  role: "admin" | "viewer";
  status: "pending" | "accepted" | "expired";
  createdAt: string;
}

export interface AgentData {
  _id: string;
  name: string;
  url: string;
  apiBaseUrl: string;
  backendUrl?: string;
  username: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AgentFormData {
  name: string;
  url: string;
  apiBaseUrl: string;
  backendUrl?: string;
  username: string;
  password: string;
}

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
  agentId: string;
  agentName: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  judgeModel: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  playwrightLog?: string[];
  summary?: RunSummary;
  createdAt: string;
}

export interface JudgeScoreDetail {
  score: number;
  explanation: string;
}

export interface KnowledgeQuality {
  score: number;
  explanation: string;
  gaps: string[];
  improvements: string[];
}

export interface JudgeScores {
  correctness: JudgeScoreDetail;
  completeness: JudgeScoreDetail;
  relevance: JudgeScoreDetail;
  faithfulness: JudgeScoreDetail;
  knowledgeQuality?: KnowledgeQuality;
  overallScore: number;
  detectedLanguage: string;
  languageMatch: boolean;
}

export interface RetrievedChunk {
  chunkId: string;
  title: string;
  content: string;
  url?: string;
  score?: number;
}

export interface SearchKnowledge {
  queries: string[];
  chunks: RetrievedChunk[];
}

/** @deprecated kept for backward compat */
export interface RetrievedArticle {
  title: string;
  chunkCount: number;
  chunks: Array<{ content: string; metadata?: Record<string, unknown> }>;
}

export type ResultType = "scored" | "knowledge_gap" | "error";

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
  resultType?: ResultType;
  errorMessage?: string;
  judgeScores?: JudgeScores;
  searchKnowledge?: SearchKnowledge;
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
  logLine?: string;
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
