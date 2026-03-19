import { spawn } from "node:child_process";

import type { Request, Response } from "express";
import { Router } from "express";

type AppKind = "systemd" | "docker";
type AppAction = "start" | "stop" | "boot-enable" | "boot-disable";

type BaseAppSpec = {
  id: string;
  name: string;
  kind: AppKind;
};

type SystemdAppSpec = BaseAppSpec & {
  kind: "systemd";
  unit: string;
};

type DockerAppSpec = BaseAppSpec & {
  kind: "docker";
  container: string;
};

type AppSpec = SystemdAppSpec | DockerAppSpec;

type ManagedApp = {
  id: string;
  name: string;
  kind: AppKind;
  target: string;
  running: boolean;
  onBoot: boolean;
  available: boolean;
  statusDetail: string;
  bootDetail: string;
  memoryBytes: number | null;
  memoryLabel: string;
};

type CmdResult = {
  code: number;
  stdout: string;
  stderr: string;
};

const APPS: AppSpec[] = [
  { id: "openclaw-gateway", name: "OpenClaw Gateway", kind: "systemd", unit: "openclaw-gateway.service" },
  { id: "gemini-livekit-agent", name: "Gemini LiveKit Agent", kind: "systemd", unit: "gemini-livekit-agent.service" },
  { id: "social-post-localizer", name: "Social Post Localizer", kind: "systemd", unit: "social-post-localizer.service" },
  { id: "server-admin", name: "Server Admin Dashboard", kind: "systemd", unit: "server-admin.service" },
  { id: "openclaw-resume-watchdog", name: "Resume Watchdog", kind: "systemd", unit: "openclaw-resume-watchdog.service" },
  { id: "openclaw-ops-watchdog", name: "Ops Watchdog", kind: "systemd", unit: "openclaw-ops-watchdog.service" },
  { id: "openclaw-ops-watchdog-reconcile", name: "Ops Watchdog Reconcile", kind: "systemd", unit: "openclaw-ops-watchdog-reconcile.service" },
  { id: "openclaw-otp-watchdog", name: "OTP Watchdog", kind: "systemd", unit: "openclaw-otp-watchdog.service" },
  { id: "code-server-openclaw", name: "Code Server", kind: "systemd", unit: "code-server@openclaw.service" },
  { id: "n8n", name: "n8n", kind: "docker", container: "n8n" },
  { id: "authelia", name: "Authelia", kind: "docker", container: "authelia" },
  { id: "authelia-redis", name: "Authelia Redis", kind: "docker", container: "authelia-redis" },
];

const router = Router();

function runCommand(command: string, args: string[]): Promise<CmdResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      stderr += error.message;
    });

    child.on("close", (code) => {
      resolve({
        code: typeof code === "number" ? code : 1,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

function parseInteger(value: string): number | null {
  if (!value) return null;
  const match = value.match(/\d+/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatBytes(value: number | null): string {
  if (value === null) return "n/a";
  if (value <= 0) return "0 MB";
  const mb = value / (1024 * 1024);
  if (mb < 1) return `${mb.toFixed(2)} MB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

async function readSystemdMemory(unit: string): Promise<number | null> {
  const result = await runCommand("systemctl", ["show", unit, "--property=MemoryCurrent", "--value"]);
  if (result.code !== 0) return null;
  return parseInteger(result.stdout);
}

async function readDockerMemory(pid: number): Promise<number | null> {
  if (pid <= 0) return 0;
  const statusPath = `/proc/${pid}/status`;
  const rssResult = await runCommand("awk", ["/^VmRSS:/ {print $2}", statusPath]);
  if (rssResult.code !== 0) return null;
  const kb = parseInteger(rssResult.stdout);
  if (kb === null) return null;
  return kb * 1024;
}

async function readSystemdState(spec: SystemdAppSpec): Promise<ManagedApp> {
  const [active, enabled, memoryBytes] = await Promise.all([
    runCommand("systemctl", ["is-active", spec.unit]),
    runCommand("systemctl", ["is-enabled", spec.unit]),
    readSystemdMemory(spec.unit),
  ]);

  const statusDetail = active.stdout || active.stderr || "unknown";
  const bootDetail = enabled.stdout || enabled.stderr || "unknown";

  return {
    id: spec.id,
    name: spec.name,
    kind: spec.kind,
    target: spec.unit,
    running: statusDetail === "active",
    onBoot: bootDetail === "enabled",
    available: statusDetail !== "not-found" && bootDetail !== "not-found",
    statusDetail,
    bootDetail,
    memoryBytes,
    memoryLabel: formatBytes(memoryBytes),
  };
}

async function readDockerState(spec: DockerAppSpec): Promise<ManagedApp> {
  const inspect = await runCommand("docker", [
    "inspect",
    "--format",
    "{{.State.Running}}|{{.HostConfig.RestartPolicy.Name}}|{{.State.Pid}}",
    spec.container,
  ]);

  if (inspect.code !== 0) {
    const detail = inspect.stderr || inspect.stdout || "not-found";
    return {
      id: spec.id,
      name: spec.name,
      kind: spec.kind,
      target: spec.container,
      running: false,
      onBoot: false,
      available: false,
      statusDetail: detail,
      bootDetail: detail,
      memoryBytes: null,
      memoryLabel: "n/a",
    };
  }

  const [runningRaw, restartPolicyRaw, pidRaw] = inspect.stdout.split("|");
  const running = runningRaw?.trim() === "true";
  const restartPolicy = restartPolicyRaw?.trim() || "no";
  const pid = parseInteger(pidRaw ?? "") ?? 0;
  const memoryBytes = await readDockerMemory(pid);

  return {
    id: spec.id,
    name: spec.name,
    kind: spec.kind,
    target: spec.container,
    running,
    onBoot: restartPolicy !== "no",
    available: true,
    statusDetail: running ? "running" : "stopped",
    bootDetail: restartPolicy,
    memoryBytes,
    memoryLabel: formatBytes(memoryBytes),
  };
}

async function readAppState(spec: AppSpec): Promise<ManagedApp> {
  if (spec.kind === "systemd") {
    return readSystemdState(spec);
  }
  return readDockerState(spec);
}

async function readAllAppStates(): Promise<ManagedApp[]> {
  const states = await Promise.all(APPS.map((spec) => readAppState(spec)));
  return states.sort((a, b) => a.name.localeCompare(b.name));
}

async function runAppAction(spec: AppSpec, action: AppAction): Promise<void> {
  if (spec.kind === "systemd") {
    const commandMap: Record<AppAction, string[]> = {
      start: ["systemctl", "start", spec.unit],
      stop: ["systemctl", "stop", spec.unit],
      "boot-enable": ["systemctl", "enable", spec.unit],
      "boot-disable": ["systemctl", "disable", spec.unit],
    };
    const args = commandMap[action];
    const result = await runCommand("sudo", args);
    if (result.code !== 0) {
      throw new Error(result.stderr || result.stdout || `Failed to ${action} ${spec.unit}`);
    }
    return;
  }

  const commandMap: Record<AppAction, string[]> = {
    start: ["start", spec.container],
    stop: ["stop", spec.container],
    "boot-enable": ["update", "--restart=unless-stopped", spec.container],
    "boot-disable": ["update", "--restart=no", spec.container],
  };
  const result = await runCommand("docker", commandMap[action]);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || `Failed to ${action} ${spec.container}`);
  }
}

function getSpecById(id: string): AppSpec {
  const spec = APPS.find((entry) => entry.id === id);
  if (!spec) {
    throw new Error(`Unknown app '${id}'`);
  }
  return spec;
}

async function mutateApp(req: Request, res: Response, action: AppAction): Promise<void> {
  try {
    const id = String(req.params.id ?? "");
    const spec = getSpecById(id);
    await runAppAction(spec, action);
    const app = await readAppState(spec);
    res.json({ app });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.startsWith("Unknown app") ? 404 : 500;
    res.status(status).json({ error: message });
  }
}

router.get("/apps", async (_req: Request, res: Response) => {
  try {
    const apps = await readAllAppStates();
    res.json({ apps });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ error: message });
  }
});

router.post("/apps/:id/start", async (req: Request, res: Response) => {
  await mutateApp(req, res, "start");
});

router.post("/apps/:id/stop", async (req: Request, res: Response) => {
  await mutateApp(req, res, "stop");
});

router.post("/apps/:id/boot-enable", async (req: Request, res: Response) => {
  await mutateApp(req, res, "boot-enable");
});

router.post("/apps/:id/boot-disable", async (req: Request, res: Response) => {
  await mutateApp(req, res, "boot-disable");
});

export default router;
