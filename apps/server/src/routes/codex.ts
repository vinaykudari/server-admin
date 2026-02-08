import type { Request, Response } from "express";
import { Router } from "express";

import { runCodexStatus } from "../services/codexStatusService.js";

const router = Router();

router.get("/codex/status", async (_req: Request, res: Response) => {
  try {
    const status = await runCodexStatus();
    // Return parsed-only; UI does not need raw terminal output.
    res.json({
      model: status.model,
      account: status.account,
      fiveHour: status.fiveHour,
      weekly: status.weekly,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});

export default router;
