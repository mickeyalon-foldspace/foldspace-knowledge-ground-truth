import { Router, Request, Response } from "express";
import { Types } from "mongoose";
import { Organization } from "../models/Organization.js";
import { User } from "../models/User.js";
import { Invite } from "../models/Invite.js";

const router = Router();

// GET /api/auth/me — current user + org info
router.get("/me", async (req: Request, res: Response) => {
  if (!req.user) {
    // Authenticated via Firebase but no user record yet — check for pending invites
    const invites = req.firebaseEmail
      ? await Invite.find({
          email: req.firebaseEmail.toLowerCase(),
          status: "pending",
        }).populate("orgId")
      : [];

    res.json({
      needsSetup: true,
      firebaseUid: req.firebaseUid,
      email: req.firebaseEmail,
      displayName: req.firebaseDisplayName,
      pendingInvites: invites.map((inv) => ({
        _id: inv._id,
        orgId: inv.orgId,
        orgName: (inv.orgId as unknown as { name: string }).name,
        role: inv.role,
      })),
    });
    return;
  }

  const org = await Organization.findById(req.user.orgId);
  res.json({
    needsSetup: false,
    user: req.user,
    organization: org,
  });
});

// POST /api/auth/signup — create org + first user (admin)
router.post("/signup", async (req: Request, res: Response) => {
  try {
    if (req.user) {
      res.status(400).json({ error: "Already registered" });
      return;
    }
    if (!req.firebaseUid) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { orgName } = req.body;
    if (!orgName) {
      res.status(400).json({ error: "orgName is required" });
      return;
    }

    const existing = await User.findOne({ firebaseUid: req.firebaseUid });
    if (existing) {
      res.status(400).json({ error: "User already exists" });
      return;
    }

    const org = await Organization.create({
      name: orgName,
      createdBy: req.firebaseUid,
    });

    const user = await User.create({
      firebaseUid: req.firebaseUid,
      email: req.firebaseEmail || "",
      displayName: req.firebaseDisplayName || "",
      orgId: org._id,
      role: "admin",
    });

    res.status(201).json({
      user: {
        _id: user._id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        orgId: user.orgId,
        role: user.role,
      },
      organization: org,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Signup failed";
    res.status(500).json({ error: msg });
  }
});

// POST /api/auth/join — accept an invite and join an org
router.post("/join", async (req: Request, res: Response) => {
  try {
    if (req.user) {
      res.status(400).json({ error: "Already registered" });
      return;
    }
    if (!req.firebaseUid) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { inviteId } = req.body;
    if (!inviteId) {
      res.status(400).json({ error: "inviteId is required" });
      return;
    }

    const invite = await Invite.findById(inviteId);
    if (!invite || invite.status !== "pending") {
      res.status(404).json({ error: "Invite not found or already used" });
      return;
    }

    if (
      invite.email.toLowerCase() !==
      (req.firebaseEmail || "").toLowerCase()
    ) {
      res.status(403).json({ error: "This invite is for a different email" });
      return;
    }

    const user = await User.create({
      firebaseUid: req.firebaseUid,
      email: req.firebaseEmail || "",
      displayName: req.firebaseDisplayName || "",
      orgId: invite.orgId,
      role: invite.role,
      invitedBy: invite.invitedBy,
    });

    invite.status = "accepted";
    await invite.save();

    const org = await Organization.findById(invite.orgId);

    res.status(201).json({
      user: {
        _id: user._id,
        firebaseUid: user.firebaseUid,
        email: user.email,
        displayName: user.displayName,
        orgId: user.orgId,
        role: user.role,
      },
      organization: org,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Join failed";
    res.status(500).json({ error: msg });
  }
});

export default router;
