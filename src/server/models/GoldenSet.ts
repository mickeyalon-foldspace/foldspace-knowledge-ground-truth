import mongoose, { Schema, Document } from "mongoose";

export interface IGoldenSetEntry {
  question: string;
  expectedAnswer: string;
  language: string;
  category?: string;
  topic?: string;
  expectedArticles?: string[];
}

export interface IGoldenSet extends Document {
  name: string;
  description?: string;
  entries: IGoldenSetEntry[];
  sourceFormat: "csv" | "json" | "xlsx";
  createdAt: Date;
  updatedAt: Date;
}

const goldenSetEntrySchema = new Schema<IGoldenSetEntry>(
  {
    question: { type: String, required: true },
    expectedAnswer: { type: String, required: true },
    language: { type: String, required: true },
    category: { type: String },
    topic: { type: String },
    expectedArticles: [{ type: String }],
  },
  { _id: false }
);

const goldenSetSchema = new Schema<IGoldenSet>(
  {
    name: { type: String, required: true },
    description: { type: String },
    entries: { type: [goldenSetEntrySchema], required: true },
    sourceFormat: {
      type: String,
      enum: ["csv", "json", "xlsx"],
      required: true,
    },
  },
  { timestamps: true }
);

export const GoldenSet = mongoose.model<IGoldenSet>(
  "GoldenSet",
  goldenSetSchema
);
