import mongoose, { Schema, Document } from "mongoose";

export interface IAgent extends Document {
  name: string;
  url: string;
  apiBaseUrl: string;
  username: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

const agentSchema = new Schema<IAgent>(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    apiBaseUrl: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
  },
  { timestamps: true }
);

export const Agent = mongoose.model<IAgent>("Agent", agentSchema);
