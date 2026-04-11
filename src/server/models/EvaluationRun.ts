import mongoose, { Schema, Document, Types } from "mongoose";

export interface IRunSummary {
  totalQuestions: number;
  completedQuestions: number;
  avgCorrectness: number;
  avgCompleteness: number;
  avgRelevance: number;
  avgFaithfulness: number;
  avgOverallScore: number;
  byLanguage: Record<
    string,
    {
      count: number;
      avgOverallScore: number;
    }
  >;
}

export interface IEvaluationRun extends Document {
  goldenSetId: Types.ObjectId;
  goldenSetName: string;
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  judgeModel: string;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  summary?: IRunSummary;
  createdAt: Date;
  updatedAt: Date;
}

const runSummarySchema = new Schema<IRunSummary>(
  {
    totalQuestions: { type: Number, default: 0 },
    completedQuestions: { type: Number, default: 0 },
    avgCorrectness: { type: Number, default: 0 },
    avgCompleteness: { type: Number, default: 0 },
    avgRelevance: { type: Number, default: 0 },
    avgFaithfulness: { type: Number, default: 0 },
    avgOverallScore: { type: Number, default: 0 },
    byLanguage: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const evaluationRunSchema = new Schema<IEvaluationRun>(
  {
    goldenSetId: {
      type: Schema.Types.ObjectId,
      ref: "GoldenSet",
      required: true,
    },
    goldenSetName: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "running", "completed", "failed"],
      default: "pending",
    },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    judgeModel: { type: String, required: true },
    startedAt: { type: Date },
    completedAt: { type: Date },
    error: { type: String },
    summary: { type: runSummarySchema },
  },
  { timestamps: true }
);

export const EvaluationRun = mongoose.model<IEvaluationRun>(
  "EvaluationRun",
  evaluationRunSchema
);
