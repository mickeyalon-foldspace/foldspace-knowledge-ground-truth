import mongoose, { Schema, Document, Types } from "mongoose";

export type ScoreCriterion =
  | "correctness"
  | "completeness"
  | "relevance"
  | "faithfulness";

export const ALL_SCORE_CRITERIA: ScoreCriterion[] = [
  "correctness",
  "completeness",
  "relevance",
  "faithfulness",
];

export interface IScoreProfile extends Document {
  orgId: Types.ObjectId;
  name: string;
  enabledCriteria: ScoreCriterion[];
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const scoreProfileSchema = new Schema<IScoreProfile>(
  {
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    name: { type: String, required: true, trim: true },
    enabledCriteria: {
      type: [String],
      enum: ALL_SCORE_CRITERIA,
      default: ["correctness", "completeness", "relevance"],
    },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

scoreProfileSchema.index({ orgId: 1, name: 1 }, { unique: true });
scoreProfileSchema.index({ orgId: 1, isDefault: 1 });

export const ScoreProfile = mongoose.model<IScoreProfile>(
  "ScoreProfile",
  scoreProfileSchema
);
