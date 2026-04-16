import mongoose, { Schema, Document } from "mongoose";

export interface IOrganization extends Document {
  name: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true }
);

export const Organization = mongoose.model<IOrganization>(
  "Organization",
  organizationSchema
);
