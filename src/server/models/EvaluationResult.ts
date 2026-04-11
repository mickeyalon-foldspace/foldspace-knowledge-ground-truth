import mongoose, { Schema, Document, Types } from "mongoose";

export interface IJudgeScores {
  correctness: { score: number; explanation: string };
  completeness: { score: number; explanation: string };
  relevance: { score: number; explanation: string };
  faithfulness: { score: number; explanation: string };
  overallScore: number;
  detectedLanguage: string;
  languageMatch: boolean;
}

export interface IRetrievedChunk {
  chunkId: string;
  title: string;
  content: string;
}

export interface ISearchKnowledge {
  queries: string[];
  chunks: IRetrievedChunk[];
}

/** @deprecated Use IRetrievedChunk instead */
export interface IRetrievedArticle {
  title: string;
  chunkCount: number;
  chunks: Array<{
    content: string;
    metadata?: Record<string, unknown>;
  }>;
}

export interface IEvaluationResult extends Document {
  runId: Types.ObjectId;
  entryIndex: number;
  question: string;
  expectedAnswer: string;
  actualAnswer: string;
  language: string;
  category?: string;
  topic?: string;
  judgeScores: IJudgeScores;
  searchKnowledge: ISearchKnowledge;
  retrievedArticles: IRetrievedArticle[];
  responseTimeMs: number;
  rawApiResponses?: unknown[];
  createdAt: Date;
}

const judgeScoreDetail = new Schema(
  {
    score: { type: Number, required: true, min: 1, max: 5 },
    explanation: { type: String, required: true },
  },
  { _id: false }
);

const retrievedChunkSchema = new Schema(
  {
    chunkId: { type: String, required: true },
    title: { type: String, required: true },
    content: { type: String, required: true },
  },
  { _id: false }
);

const searchKnowledgeSchema = new Schema(
  {
    queries: { type: [String], default: [] },
    chunks: { type: [retrievedChunkSchema], default: [] },
  },
  { _id: false }
);

const legacyChunkSchema = new Schema(
  {
    content: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const retrievedArticleSchema = new Schema(
  {
    title: { type: String, required: true },
    chunkCount: { type: Number, required: true },
    chunks: { type: [legacyChunkSchema], default: [] },
  },
  { _id: false }
);

const judgeScoresSchema = new Schema<IJudgeScores>(
  {
    correctness: { type: judgeScoreDetail, required: true },
    completeness: { type: judgeScoreDetail, required: true },
    relevance: { type: judgeScoreDetail, required: true },
    faithfulness: { type: judgeScoreDetail, required: true },
    overallScore: { type: Number, required: true },
    detectedLanguage: { type: String, required: true },
    languageMatch: { type: Boolean, required: true },
  },
  { _id: false }
);

const evaluationResultSchema = new Schema<IEvaluationResult>(
  {
    runId: {
      type: Schema.Types.ObjectId,
      ref: "EvaluationRun",
      required: true,
      index: true,
    },
    entryIndex: { type: Number, required: true },
    question: { type: String, required: true },
    expectedAnswer: { type: String, required: true },
    actualAnswer: { type: String, required: true },
    language: { type: String, required: true },
    category: { type: String },
    topic: { type: String },
    judgeScores: { type: judgeScoresSchema, required: true },
    searchKnowledge: { type: searchKnowledgeSchema, default: { queries: [], chunks: [] } },
    retrievedArticles: { type: [retrievedArticleSchema], default: [] },
    responseTimeMs: { type: Number, required: true },
    rawApiResponses: { type: [Schema.Types.Mixed] },
  },
  { timestamps: true }
);

export const EvaluationResult = mongoose.model<IEvaluationResult>(
  "EvaluationResult",
  evaluationResultSchema
);
