import type { Request, Response } from "express";
import { Router } from "express";

import {
  ValidationError,
  createCredential,
  listCredentials,
  listManagedEnv,
  removeCredential,
  removeManagedEnv,
  updateCredential,
  upsertManagedEnv,
} from "../services/configService.js";

const router = Router();

function sendError(res: Response, error: unknown): void {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = error instanceof ValidationError ? 400 : 500;
  res.status(status).json({ error: message });
}

router.get("/config/env", async (_req: Request, res: Response) => {
  try {
    const payload = await listManagedEnv();
    res.json(payload);
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/config/env/:key", async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key ?? "");
    const value = typeof req.body?.value === "string" ? req.body.value : "";
    const entry = await upsertManagedEnv(key, value);
    res.json({ entry });
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/config/env/:key", async (req: Request, res: Response) => {
  try {
    const key = String(req.params.key ?? "");
    await removeManagedEnv(key);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

router.get("/config/credentials", async (_req: Request, res: Response) => {
  try {
    const payload = await listCredentials();
    res.json(payload);
  } catch (error) {
    sendError(res, error);
  }
});

router.post("/config/credentials", async (req: Request, res: Response) => {
  try {
    const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
    const username = typeof req.body?.username === "string" ? req.body.username : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const entry = await createCredential(domain, username, password);
    res.status(201).json({ entry });
  } catch (error) {
    sendError(res, error);
  }
});

router.put("/config/credentials/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? "");
    const domain = typeof req.body?.domain === "string" ? req.body.domain : "";
    const username = typeof req.body?.username === "string" ? req.body.username : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const entry = await updateCredential(id, domain, username, password);
    res.json({ entry });
  } catch (error) {
    sendError(res, error);
  }
});

router.delete("/config/credentials/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id ?? "");
    await removeCredential(id);
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error);
  }
});

export default router;
