import type { Request, Response } from "express";
import { Router } from "express";

import { listAgentIds, listAgentLogSessions, readAgentSessionLog } from "../services/agentLogsService.js";

const router = Router();

router.get("/agents/logs", async (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 40);
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 40;

  const agents = await listAgentIds();
  const requested = typeof req.query.agent === "string" ? req.query.agent : "";
  const selected = requested && agents.includes(requested) ? requested : agents[0] ?? null;

  if (!selected) {
    res.json({ agents, agent: null, sessions: [] });
    return;
  }

  try {
    const sessions = await listAgentLogSessions(selected, safeLimit);
    res.json({ agents, agent: selected, sessions });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ error: message });
  }
});

router.get("/agents/logs/:agentId/:sessionId", async (req: Request, res: Response) => {
  const agentId = String(req.params.agentId);
  const sessionId = String(req.params.sessionId);
  const tail = Number(req.query.tail ?? 300);
  const safeTail = Number.isFinite(tail) ? Math.max(1, Math.min(5000, tail)) : 300;

  try {
    const payload = await readAgentSessionLog(agentId, sessionId, safeTail);
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(404).json({ error: message });
  }
});

export default router;
