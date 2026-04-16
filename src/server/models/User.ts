import mongoose, { Schema, Document, Types } from "mongoose";

export type UserRole = "admin" | "viewer";

export interface IUser extends Document {
  firebaseUid: string;
  email: string;
  displayName: string;
  orgId: Types.ObjectId;
  role: UserRole;
  invitedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    firebaseUid: { type: String, required: true, unique: true },
    email: { type: String, required: true },
    displayName: { type: String, required: true },
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
    invitedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>("User", userSchema);
