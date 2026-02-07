import type { Request, Response } from "express";
import { Router } from "express";

import { getLogs } from "../services/logsService.js";

const router = Router();

router.get("/logs", async (_req: Request, res: Response) => {
  try {
    const payload = await getLogs();
    res.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

export default router;
