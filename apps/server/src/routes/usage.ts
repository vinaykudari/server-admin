import type { Request, Response } from "express";
import { Router } from "express";

import {
  getCodexAccountsSummary,
  getCodexSourceUsageSummary,
  getCodexStatusSummary,
  getCodexUsageSummary,
  getGcpBillingSummary,
} from "../services/usageService.js";

const router = Router();

router.get("/usage/codex", async (_req: Request, res: Response) => {
  const data = await getCodexUsageSummary();
  res.json(data);
});

router.get("/usage/codex-status", async (req: Request, res: Response) => {
  try {
    const refresh = String(req.query.refresh ?? "").toLowerCase() === "true";
    const accountId = typeof req.query.account === "string" ? req.query.account : undefined;
    const data = await getCodexStatusSummary(refresh, accountId);
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});

router.get("/usage/codex-accounts", async (req: Request, res: Response) => {
  try {
    const refresh = String(req.query.refresh ?? "").toLowerCase() === "true";
    const data = await getCodexAccountsSummary(refresh);
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});

router.get("/usage/codex-sources", async (req: Request, res: Response) => {
  try {
    const rawHours = typeof req.query.lookbackHours === "string" ? Number(req.query.lookbackHours) : 24;
    const lookbackHours = Number.isFinite(rawHours) ? rawHours : 24;
    const data = await getCodexSourceUsageSummary(lookbackHours);
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});

router.get("/usage/gcp-billing", async (req: Request, res: Response) => {
  try {
    const refresh = String(req.query.refresh ?? "").toLowerCase() === "true";
    const data = await getGcpBillingSummary(refresh);
    res.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(502).json({ error: message });
  }
});

export default router;
