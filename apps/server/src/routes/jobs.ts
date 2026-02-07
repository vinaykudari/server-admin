import type { Request, Response } from "express";
import { Router } from "express";
import { spawn } from "node:child_process";

import { listActiveJobs, readGatewayLogRecent, readJobActions, resolveGatewayLogPath } from "../services/jobsService.js";

const router = Router();

router.get("/jobs/active", async (_req: Request, res: Response) => {
  const { jobs, warning } = await listActiveJobs();
  res.json({ jobs, warning });
});

router.get("/jobs/:messageId/actions", async (req: Request, res: Response) => {
  const messageId = String(req.params.messageId);
  const limit = Number(req.query.limit ?? 500);
  const safe = Number.isFinite(limit) ? Math.max(1, Math.min(5000, limit)) : 500;
  const events = await readJobActions(messageId, safe);
  res.json({ events });
});

router.get("/jobs/gateway-log/recent", async (req: Request, res: Response) => {
  const tail = Number(req.query.tail ?? 300);
  const lines = await readGatewayLogRecent(tail);
  res.json({ lines });
});

router.get("/jobs/gateway-log/stream", async (req: Request, res: Response) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.write(`event: ready\ndata: ${Date.now()}\n\n`);

  const container = "openclaw-openclaw-gateway-1";
  let logPath: string;
  try {
    logPath = await resolveGatewayLogPath();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
    res.end();
    return;
  }

  // Stream JSON lines from the gateway log file.
  const proc = spawn(
    "docker",
    ["exec", "-i", container, "sh", "-lc", `tail -n 0 -F ${logPath}`],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const keepAlive = setInterval(() => {
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15000);

  proc.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      res.write(`event: log\ndata: ${JSON.stringify({ line: trimmed })}\n\n`);
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf8").trim();
    if (!msg) return;
    res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
  });

  const close = () => {
    clearInterval(keepAlive);
    proc.kill("SIGTERM");
  };

  req.on("close", close);
});

export default router;
