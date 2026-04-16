import { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";
import { config } from "../config.js";
import { User, IUser } from "../models/User.js";
import type { Types } from "mongoose";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey: config.firebase.privateKey,
    }),
  });
}

export interface AuthUser {
  _id: Types.ObjectId;
  firebaseUid: string;
  email: string;
  displayName: string;
  orgId: Types.ObjectId;
  role: "admin" | "viewer";
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      firebaseUid?: string;
      firebaseEmail?: string;
      firebaseDisplayName?: string;
    }
  }
}

export async function firebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  const queryToken = req.query.token as string | undefined;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : queryToken;

  if (!token) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.firebaseUid = decoded.uid;
    req.firebaseEmail = decoded.email || "";
    req.firebaseDisplayName = decoded.name || decoded.email || "";

    const user = await User.findOne({ firebaseUid: decoded.uid });
    if (user) {
      req.user = {
        _id: user._id as Types.ObjectId,
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        orgId: user.orgId,
        role: user.role,
      };
    }

    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireUser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(403).json({ error: "Account setup required" });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(403).json({ error: "Account setup required" });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}
