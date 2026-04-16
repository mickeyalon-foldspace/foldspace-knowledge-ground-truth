import { Router, Request, Response } from "express";
import multer from "multer";
import { GoldenSet } from "../models/GoldenSet.js";
import { parseFile, detectFormat } from "../services/ingestion.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const sets = await GoldenSet.find({ orgId: req.user!.orgId })
      .select("-entries")
      .sort({ createdAt: -1 });

    const withCounts = await Promise.all(
      sets.map(async (s) => {
        const full = await GoldenSet.findById(s._id);
        const entries = full?.entries || [];
        const languages = [...new Set(entries.map((e) => e.language))];
        return {
          ...s.toObject(),
          entryCount: entries.length,
          languages,
        };
      })
    );

    res.json(withCounts);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch golden sets" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const set = await GoldenSet.findOne({
      _id: paramId(req),
      orgId: req.user!.orgId,
    });
    if (!set) {
      res.status(404).json({ error: "Golden set not found" });
      return;
    }
    res.json(set);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch golden set" });
  }
});

router.post(
  "/preview",
  requireRole("admin"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const format = detectFormat(file.originalname);
      if (!format) {
        res.status(400).json({
          error: "Unsupported file format. Use CSV, JSON, or XLSX.",
        });
        return;
      }

      const entries = await parseFile(file.buffer, format);
      const languages = [...new Set(entries.map((e) => e.language))];

      res.json({ entries, sourceFormat: format, languages });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Preview failed";
      res.status(400).json({ error: message });
    }
  }
);

router.post(
  "/save",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { name, description, entries, sourceFormat } = req.body;
      if (
        !name ||
        !entries ||
        !Array.isArray(entries) ||
        entries.length === 0
      ) {
        res
          .status(400)
          .json({ error: "name and non-empty entries array are required" });
        return;
      }

      const goldenSet = await GoldenSet.create({
        orgId: req.user!.orgId,
        name,
        description,
        entries,
        sourceFormat: sourceFormat || "json",
      });

      const languages = [
        ...new Set(
          entries.map((e: { language: string }) => e.language)
        ),
      ];

      res.status(201).json({
        id: goldenSet._id,
        name: goldenSet.name,
        entryCount: goldenSet.entries.length,
        sourceFormat: goldenSet.sourceFormat,
        languages,
        createdAt: goldenSet.createdAt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Save failed";
      res.status(400).json({ error: message });
    }
  }
);

router.post(
  "/upload",
  requireRole("admin"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const format = detectFormat(file.originalname);
      if (!format) {
        res.status(400).json({
          error: "Unsupported file format. Use CSV, JSON, or XLSX.",
        });
        return;
      }

      const entries = await parseFile(file.buffer, format);

      const name =
        (req.body.name as string) ||
        file.originalname.replace(/\.[^.]+$/, "");
      const description = req.body.description as string | undefined;

      const goldenSet = await GoldenSet.create({
        orgId: req.user!.orgId,
        name,
        description,
        entries,
        sourceFormat: format,
      });

      const languages = [...new Set(entries.map((e) => e.language))];

      res.status(201).json({
        id: goldenSet._id,
        name: goldenSet.name,
        entryCount: goldenSet.entries.length,
        sourceFormat: goldenSet.sourceFormat,
        languages,
        createdAt: goldenSet.createdAt,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed";
      res.status(400).json({ error: message });
    }
  }
);

router.delete(
  "/:id",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const result = await GoldenSet.findOneAndDelete({
        _id: paramId(req),
        orgId: req.user!.orgId,
      });
      if (!result) {
        res.status(404).json({ error: "Golden set not found" });
        return;
      }
      res.json({ message: "Golden set deleted" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete golden set" });
    }
  }
);

export default router;
