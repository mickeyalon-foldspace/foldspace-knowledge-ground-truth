import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import {
  ScoreProfile,
  IScoreProfile,
  ALL_SCORE_CRITERIA,
  ScoreCriterion,
} from "../models/ScoreProfile.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

function isValidObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

function serializeProfile(p: IScoreProfile) {
  return {
    _id: p._id,
    name: p.name,
    enabledCriteria: p.enabledCriteria,
    isDefault: p.isDefault,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

function validateCriteria(input: unknown): ScoreCriterion[] | null {
  if (!Array.isArray(input)) return null;
  const valid: ScoreCriterion[] = [];
  for (const v of input) {
    if (typeof v !== "string") return null;
    if (!ALL_SCORE_CRITERIA.includes(v as ScoreCriterion)) return null;
    if (!valid.includes(v as ScoreCriterion)) {
      valid.push(v as ScoreCriterion);
    }
  }
  return valid;
}

async function ensureDefaultProfile(
  orgId: mongoose.Types.ObjectId
): Promise<void> {
  const count = await ScoreProfile.countDocuments({ orgId });
  if (count === 0) {
    await ScoreProfile.create({
      orgId,
      name: "Without Faithfulness",
      enabledCriteria: ["correctness", "completeness", "relevance"],
      isDefault: true,
    });
  } else {
    const anyDefault = await ScoreProfile.findOne({ orgId, isDefault: true });
    if (!anyDefault) {
      const first = await ScoreProfile.findOne({ orgId }).sort({ createdAt: 1 });
      if (first) {
        first.isDefault = true;
        await first.save();
      }
    }
  }
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const orgId = req.user!.orgId;
    await ensureDefaultProfile(orgId);
    const profiles = await ScoreProfile.find({ orgId }).sort({
      isDefault: -1,
      name: 1,
    });
    res.json(profiles.map(serializeProfile));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch score profiles" });
  }
});

router.post(
  "/",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { name, enabledCriteria, isDefault } = req.body as {
        name?: string;
        enabledCriteria?: unknown;
        isDefault?: boolean;
      };
      if (!name || typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      const validCriteria = validateCriteria(enabledCriteria);
      if (!validCriteria) {
        res.status(400).json({
          error: `enabledCriteria must be an array of: ${ALL_SCORE_CRITERIA.join(", ")}`,
        });
        return;
      }

      const orgId = req.user!.orgId;

      if (isDefault) {
        await ScoreProfile.updateMany(
          { orgId, isDefault: true },
          { $set: { isDefault: false } }
        );
      }

      const profile = await ScoreProfile.create({
        orgId,
        name: name.trim(),
        enabledCriteria: validCriteria,
        isDefault: Boolean(isDefault),
      });

      res.status(201).json(serializeProfile(profile));
    } catch (error) {
      const err = error as { code?: number; message?: string };
      if (err && err.code === 11000) {
        res.status(409).json({ error: "A profile with that name already exists" });
        return;
      }
      res.status(500).json({ error: "Failed to create score profile" });
    }
  }
);

router.put(
  "/:id",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const id = paramId(req);
      if (!isValidObjectId(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const orgId = req.user!.orgId;
      const { name, enabledCriteria, isDefault } = req.body as {
        name?: string;
        enabledCriteria?: unknown;
        isDefault?: boolean;
      };

      const update: Partial<{
        name: string;
        enabledCriteria: ScoreCriterion[];
        isDefault: boolean;
      }> = {};

      if (name !== undefined) {
        if (typeof name !== "string" || !name.trim()) {
          res.status(400).json({ error: "name must be a non-empty string" });
          return;
        }
        update.name = name.trim();
      }
      if (enabledCriteria !== undefined) {
        const validCriteria = validateCriteria(enabledCriteria);
        if (!validCriteria) {
          res.status(400).json({
            error: `enabledCriteria must be an array of: ${ALL_SCORE_CRITERIA.join(", ")}`,
          });
          return;
        }
        update.enabledCriteria = validCriteria;
      }
      if (isDefault === true) {
        await ScoreProfile.updateMany(
          { orgId, _id: { $ne: id }, isDefault: true },
          { $set: { isDefault: false } }
        );
        update.isDefault = true;
      } else if (isDefault === false) {
        update.isDefault = false;
      }

      const profile = await ScoreProfile.findOneAndUpdate(
        { _id: id, orgId },
        update,
        { new: true }
      );
      if (!profile) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }
      res.json(serializeProfile(profile));
    } catch (error) {
      const err = error as { code?: number };
      if (err && err.code === 11000) {
        res.status(409).json({ error: "A profile with that name already exists" });
        return;
      }
      res.status(500).json({ error: "Failed to update score profile" });
    }
  }
);

router.delete(
  "/:id",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const id = paramId(req);
      if (!isValidObjectId(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const orgId = req.user!.orgId;
      const profile = await ScoreProfile.findOne({ _id: id, orgId });
      if (!profile) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }
      const remaining = await ScoreProfile.countDocuments({ orgId });
      if (remaining <= 1) {
        res.status(400).json({
          error: "Cannot delete the only remaining profile",
        });
        return;
      }
      const wasDefault = profile.isDefault;
      await profile.deleteOne();

      if (wasDefault) {
        const fallback = await ScoreProfile.findOne({ orgId }).sort({
          createdAt: 1,
        });
        if (fallback) {
          fallback.isDefault = true;
          await fallback.save();
        }
      }

      res.json({ message: "Profile deleted" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete score profile" });
    }
  }
);

router.post(
  "/:id/set-default",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const id = paramId(req);
      if (!isValidObjectId(id)) {
        res.status(400).json({ error: "Invalid id" });
        return;
      }
      const orgId = req.user!.orgId;
      const profile = await ScoreProfile.findOne({ _id: id, orgId });
      if (!profile) {
        res.status(404).json({ error: "Profile not found" });
        return;
      }
      await ScoreProfile.updateMany(
        { orgId, _id: { $ne: id } },
        { $set: { isDefault: false } }
      );
      profile.isDefault = true;
      await profile.save();
      res.json(serializeProfile(profile));
    } catch (error) {
      res.status(500).json({ error: "Failed to set default profile" });
    }
  }
);

export default router;
