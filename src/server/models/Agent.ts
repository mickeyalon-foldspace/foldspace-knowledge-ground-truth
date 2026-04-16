import mongoose, { Schema, Document, Types } from "mongoose";

export interface IAgent extends Document {
  orgId: Types.ObjectId;
  name: string;
  url: string;
  apiBaseUrl: string;
  backendUrl: string;
  username: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

const agentSchema = new Schema<IAgent>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    name: { type: String, required: true },
    url: { type: String, required: true },
    apiBaseUrl: { type: String, required: true },
    backendUrl: { type: String, default: "" },
    username: { type: String, required: true },
    password: { type: String, required: true },
  },
  { timestamps: true }
);

export const Agent = mongoose.model<IAgent>("Agent", agentSchema);
