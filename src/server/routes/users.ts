import { Router, Request, Response } from "express";
import { User } from "../models/User.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

// List users in current org (admin only)
router.get("/", requireRole("admin"), async (req: Request, res: Response) => {
  try {
    const users = await User.find({ orgId: req.user!.orgId })
      .select("-firebaseUid")
      .sort({ createdAt: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Change a user's role (admin only)
router.put(
  "/:id/role",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { role } = req.body;
      if (!role || !["admin", "viewer"].includes(role)) {
        res.status(400).json({ error: "role must be 'admin' or 'viewer'" });
        return;
      }

      const targetId = paramId(req);
      if (targetId === req.user!._id.toString()) {
        res.status(400).json({ error: "Cannot change your own role" });
        return;
      }

      const user = await User.findOneAndUpdate(
        { _id: targetId, orgId: req.user!.orgId },
        { role },
        { new: true }
      );
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.json({
        _id: user._id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to update role" });
    }
  }
);

// Remove a user from org (admin only)
router.delete(
  "/:id",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const targetId = paramId(req);
      if (targetId === req.user!._id.toString()) {
        res.status(400).json({ error: "Cannot remove yourself" });
        return;
      }

      const user = await User.findOneAndDelete({
        _id: targetId,
        orgId: req.user!.orgId,
      });
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      res.json({ message: "User removed" });
    } catch (error) {
      res.status(500).json({ error: "Failed to remove user" });
    }
  }
);

export default router;
