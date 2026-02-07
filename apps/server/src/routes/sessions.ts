import type { Request, Response } from "express";
import { Router } from "express";
import { spawn } from "node:child_process";

import { readRecentActions } from "../services/actionsService.js";
import { listActiveCodexProcesses } from "../services/sessionsService.js";
import { actionsLogPath } from "../utils/paths.js";

const router = Router();

router.get("/actions/recent", async (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 200);
  const events = await readRecentActions(limit);
  res.json({ events });
});

router.get("/sessions/active", async (_req: Request, res: Response) => {
  const result = await listActiveCodexProcesses();
  if (result.ok) {
    res.json({ processes: result.processes });
    return;
  }
  res.status(200).json({ processes: result.processes, error: result.error });
});

router.get("/stream/actions", (req: Request, res: Response) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.write(`event: ready\ndata: ${Date.now()}\n\n`);

  const keepAlive = setInterval(() => {
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15000);

  const tail = spawn("tail", ["-n", "0", "-F", actionsLogPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  const onChunk = (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      res.write(`event: action\ndata: ${trimmed}\n\n`);
    }
  };

  tail.stdout?.on("data", onChunk);
  tail.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf8").trim();
    if (!msg) return;
    res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
  });

  const close = () => {
    clearInterval(keepAlive);
    tail.kill("SIGTERM");
  };

  req.on("close", close);
});

export default router;
