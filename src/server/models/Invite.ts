import mongoose, { Schema, Document, Types } from "mongoose";
import type { UserRole } from "./User.js";

export interface IInvite extends Document {
  email: string;
  orgId: Types.ObjectId;
  role: UserRole;
  invitedBy: Types.ObjectId;
  status: "pending" | "accepted" | "expired";
  createdAt: Date;
  updatedAt: Date;
}

const inviteSchema = new Schema<IInvite>(
  {
    email: { type: String, required: true },
    orgId: {
      type: Schema.Types.ObjectId,
      ref: "Organization",
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "viewer"],
      default: "viewer",
    },
    invitedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "expired"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export const Invite = mongoose.model<IInvite>("Invite", inviteSchema);
