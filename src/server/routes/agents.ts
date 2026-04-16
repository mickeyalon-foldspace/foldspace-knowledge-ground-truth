import { Router, Request, Response } from "express";
import { Agent } from "../models/Agent.js";
import { PlaywrightEngine } from "../services/playwright-engine.js";
import { requireRole } from "../middleware/auth.js";

const router = Router();

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const agents = await Agent.find({ orgId: req.user!.orgId }).sort({
      createdAt: -1,
    });
    const safe = agents.map((a) => ({
      _id: a._id,
      name: a.name,
      url: a.url,
      apiBaseUrl: a.apiBaseUrl,
      username: a.username,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));
    res.json(safe);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch agents" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const agent = await Agent.findOne({
      _id: paramId(req),
      orgId: req.user!.orgId,
    });
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({
      _id: agent._id,
      name: agent.name,
      url: agent.url,
      apiBaseUrl: agent.apiBaseUrl,
      username: agent.username,
      createdAt: agent.createdAt,
      updatedAt: agent.updatedAt,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch agent" });
  }
});

router.post(
  "/",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { name, url, apiBaseUrl, username, password } = req.body;
      if (!name || !url || !apiBaseUrl || !username || !password) {
        res
          .status(400)
          .json({
            error: "name, url, apiBaseUrl, username, password are required",
          });
        return;
      }
      const agent = await Agent.create({
        orgId: req.user!.orgId,
        name,
        url,
        apiBaseUrl,
        username,
        password,
      });
      res.status(201).json({
        _id: agent._id,
        name: agent.name,
        url: agent.url,
        apiBaseUrl: agent.apiBaseUrl,
        username: agent.username,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to create agent" });
    }
  }
);

router.put(
  "/:id",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const { name, url, apiBaseUrl, username, password } = req.body;
      const update: Record<string, string> = {};
      if (name) update.name = name;
      if (url) update.url = url;
      if (apiBaseUrl) update.apiBaseUrl = apiBaseUrl;
      if (username) update.username = username;
      if (password) update.password = password;

      const agent = await Agent.findOneAndUpdate(
        { _id: paramId(req), orgId: req.user!.orgId },
        update,
        { new: true }
      );
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }
      res.json({
        _id: agent._id,
        name: agent.name,
        url: agent.url,
        apiBaseUrl: agent.apiBaseUrl,
        username: agent.username,
      });
    } catch (error) {
      res.status(500).json({ error: "Failed to update agent" });
    }
  }
);

router.delete(
  "/:id",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      await Agent.findOneAndDelete({
        _id: paramId(req),
        orgId: req.user!.orgId,
      });
      res.json({ message: "Agent deleted" });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete agent" });
    }
  }
);

router.post(
  "/:id/test-auth",
  requireRole("admin"),
  async (req: Request, res: Response) => {
    try {
      const agent = await Agent.findOne({
        _id: paramId(req),
        orgId: req.user!.orgId,
      });
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      const engine = new PlaywrightEngine();
      try {
        await engine.initialize();
        await engine.login({
          url: agent.url,
          apiBaseUrl: agent.apiBaseUrl,
          username: agent.username,
          password: agent.password,
        });
        res.json({ success: true, message: "Authentication successful" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        res.json({
          success: false,
          message: `Authentication failed: ${msg}`,
        });
      } finally {
        await engine.close();
      }
    } catch (error) {
      res.status(500).json({ error: "Failed to test authentication" });
    }
  }
);

export default router;
