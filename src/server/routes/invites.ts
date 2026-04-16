import { Router, Request, Response } from "express";
import { Invite } from "../models/Invite.js";
import { User } from "../models/User.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

// List invites for current org (admin only)
router.get("/", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const invites = await Invite.find({ orgId: req.user!.orgId }).sort({
      createdAt: -1,
    });
    res.json(invites);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch invites" });
  }
});

// Create an invite (admin only)
router.post("/", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const { email, role } = req.body;
    if (!email) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    const validRole = role === "admin" ? "admin" : "viewer";

    // Check if user already exists in this org
    const existingUser = await User.findOne({
      email: email.toLowerCase(),
      orgId: req.user!.orgId,
    });
    if (existingUser) {
      res.status(400).json({ error: "User is already a member of this org" });
      return;
    }

    // Check for existing pending invite
    const existingInvite = await Invite.findOne({
      email: email.toLowerCase(),
      orgId: req.user!.orgId,
      status: "pending",
    });
    if (existingInvite) {
      res.status(400).json({ error: "Pending invite already exists for this email" });
      return;
    }

    const invite = await Invite.create({
      email: email.toLowerCase(),
      orgId: req.user!.orgId,
      role: validRole,
      invitedBy: req.user!._id,
    });

    res.status(201).json(invite);
  } catch (error) {
    res.status(500).json({ error: "Failed to create invite" });
  }
});

// Revoke an invite (admin only)
router.delete(
  "/:id",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const invite = await Invite.findOneAndDelete({
        _id: paramId(req),
        orgId: req.user!.orgId,
      });
      if (!invite) {
        res.status(404).json({ error: "Invite not found" });
        return;
      }
      res.json({ message: "Invite revoked" });
    } catch (error) {
      res.status(500).json({ error: "Failed to revoke invite" });
    }
  }
);

export default router;
