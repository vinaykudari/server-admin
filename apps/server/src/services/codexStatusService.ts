import pty from "node-pty";

export type CodexStatus = {
  model?: string;
  account?: string;
  fiveHour?: { leftPercent: number; resets: string };
  weekly?: { leftPercent: number; resets: string };
  raw?: string;
};

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
}

function parseStatus(text: string): CodexStatus {
  const clean = stripAnsi(text);
  const out: CodexStatus = {};

  const model = clean.match(/\bModel:\s*(.+)$/m)?.[1]?.trim();
  if (model) out.model = model;

  const account = clean.match(/\bAccount:\s*(.+)$/m)?.[1]?.trim();
  if (account) out.account = account;

  const five = clean.match(/\b5h\s+limit:\s*.*?(\d+)%\s+left\s*\(resets\s*([^\)]+)\)/i);
  if (five?.[1] && five?.[2]) {
    out.fiveHour = { leftPercent: Number(five[1]), resets: five[2].trim() };
  }

  const weekly = clean.match(/\bWeekly\s+limit:\s*.*?(\d+)%\s+left\s*\(resets\s*([^\)]+)\)/i);
  if (weekly?.[1] && weekly?.[2]) {
    out.weekly = { leftPercent: Number(weekly[1]), resets: weekly[2].trim() };
  }

  return out;
}

function respondToTerminalQueries(chunk: string, write: (s: string) => void) {
  // Codex checks cursor position using DSR (ESC [ 6 n). In a PTY, nothing responds unless we do.
  // We reply with a fixed cursor position.
  if (chunk.includes("\u001b[6n") || chunk.includes("\u001b[?6n")) {
    write("\u001b[1;1R");
  }
}

export async function runCodexStatus(timeoutMs = 20000): Promise<CodexStatus> {
  return await new Promise((resolve, reject) => {
    const term = pty.spawn(
      "sudo",
      ["-u", "openclaw", "-H", "codex", "--no-alt-screen"],
      {
        name: "xterm-256color",
        cols: 120,
        rows: 40,
        cwd: "/home/openclaw",
        env: {
          ...process.env,
          TERM: "xterm-256color",
        },
      },
    );

    let buf = "";
    let done = false;

    const hard = setTimeout(() => {
      try {
        term.write("/quit\r");
      } catch {
        // ignore
      }
      try {
        term.kill();
      } catch {
        // ignore
      }
      if (!done) {
        done = true;
        reject(new Error("Timed out running codex /status"));
      }
    }, timeoutMs);

    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(hard);
      const parsed = parseStatus(buf);
      parsed.raw = buf;
      if (ok) resolve(parsed);
      else reject(new Error("Could not parse /status output"));
    };

    const maybeQuit = () => {
      const clean = stripAnsi(buf);
      if (clean.includes("5h limit") && clean.includes("Weekly limit")) {
        // Give it a beat to finish drawing.
        setTimeout(() => {
          try {
            term.write("/quit\r");
          } catch {
            // ignore
          }
        }, 250);
      }
    };

    term.onData((data) => {
      buf += data;
      if (buf.length > 300_000) buf = buf.slice(-200_000);
      respondToTerminalQueries(data, (s) => {
        try {
          term.write(s);
        } catch {
          // ignore
        }
      });
      maybeQuit();
    });

    term.onExit(() => {
      const parsed = parseStatus(buf);
      const ok = Boolean(parsed.fiveHour && parsed.weekly);
      finish(ok);
    });

    // /status sometimes gets ignored if sent too early; retry once.
    setTimeout(() => {
      try {
        term.write("/status\r");
      } catch {
        // ignore
      }
    }, 1200);

    setTimeout(() => {
      if (stripAnsi(buf).includes("Weekly limit")) return;
      try {
        term.write("/status\r");
      } catch {
        // ignore
      }
    }, 4200);
  });
}
