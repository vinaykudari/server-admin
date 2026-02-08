import type { Request, Response } from "express";
import { Router } from "express";

import { getCodexUsageSummary } from "../services/usageService.js";

const router = Router();

router.get("/usage/codex", async (_req: Request, res: Response) => {
  const data = await getCodexUsageSummary();
  res.json(data);
});

export default router;
