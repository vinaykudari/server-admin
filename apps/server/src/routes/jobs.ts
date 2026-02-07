import type { Request, Response } from "express";
import { Router } from "express";
import { spawn } from "node:child_process";

import {
  listActiveJobs,
  listRecentJobs,
  readGatewayLogRecent,
  readJobActions,
  readJobOutputRecent,
  resolveGatewayLogPath,
  resolveJobOutputPath,
} from "../services/jobsService.js";

const router = Router();

router.get("/jobs/active", async (_req: Request, res: Response) => {
  const { jobs, warning } = await listActiveJobs();
  res.json({ jobs, warning });
});

router.get("/jobs/recent", async (req: Request, res: Response) => {
  const limit = Number(req.query.limit ?? 50);
  const safe = Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 50;
  const jobs = await listRecentJobs(safe);
  res.json({ jobs });
});

router.get("/jobs/:messageId/actions", async (req: Request, res: Response) => {
  const messageId = String(req.params.messageId);
  const limit = Number(req.query.limit ?? 500);
  const safe = Number.isFinite(limit) ? Math.max(1, Math.min(5000, limit)) : 500;
  const events = await readJobActions(messageId, safe);
  res.json({ events });
});

router.get("/jobs/:messageId/output/recent", async (req: Request, res: Response) => {
  const messageId = String(req.params.messageId);
  const tail = Number(req.query.tail ?? 300);

  try {
    const { path, lines } = await readJobOutputRecent(messageId, tail);
    res.json({ path, lines });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Missing output logs is expected for jobs started before output logging, or before first job finishes.
    res.status(404).json({ error: msg });
  }
});

router.get("/jobs/:messageId/output/stream", async (req: Request, res: Response) => {
  const messageId = String(req.params.messageId);

  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.write(`event: ready\ndata: ${Date.now()}\n\n`);

  let closed = false;
  const keepAlive = setInterval(() => {
    res.write(`event: ping\ndata: ${Date.now()}\n\n`);
  }, 15000);

  const close = () => {
    closed = true;
    clearInterval(keepAlive);
  };

  req.on("close", close);

  const waitForPath = async (): Promise<string> => {
    for (let i = 0; i < 120; i += 1) {
      if (closed) throw new Error("Client closed");
      try {
        return await resolveJobOutputPath(messageId);
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error(
      "Output log not found yet (waited 120s). Start a new task or wait for the job to produce output logs.",
    );
  };

  let filePath: string;
  try {
    filePath = await waitForPath();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.write(`event: server_error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
    res.end();
    return;
  }

  res.write(`event: path\ndata: ${JSON.stringify({ path: filePath })}\n\n`);

  const proc = spawn("tail", ["-n", "0", "-F", filePath], { stdio: ["ignore", "pipe", "pipe"] });

  proc.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.replace(/\r$/, "").trim();
      if (!trimmed) continue;
      res.write(`event: log\ndata: ${JSON.stringify({ line: trimmed })}\n\n`);
    }
  });

  proc.stderr?.on("data", (chunk: Buffer) => {
    const msg = chunk.toString("utf8").trim();
    if (!msg) return;
    res.write(`event: server_error\ndata: ${JSON.stringify({ message: msg })}\n\n`);
  });

  req.on("close", () => {
    proc.kill("SIGTERM");
  });
});

router.get("/jobs/gateway-log/recent", async (req: Request, res: Response) => {
  const tail = Number(req.query.tail ?? 300);

  try {
    const lines = await readGatewayLogRecent(tail);
    res.json({ lines });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.json({ lines: [], warning: msg });
  }
});

router.get("/jobs/gateway-log/stream", async (req: Request, res: Response) => {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  res.write(`event: ready\ndata: ${Date.now()}\n\n`);

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
  // Stream JSON lines from the gateway log file (native host).
  const proc = spawn("tail", ["-n", "0", "-F", logPath], { stdio: ["ignore", "pipe", "pipe"] });

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
