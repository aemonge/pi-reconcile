/**
 * Executors: spawn syncs as detached background processes. Fail-open by
 * contract — a failing sync logs and is reported, but never throws into the
 * session and never blocks work.
 *
 * Output goes to a per-run log file (default .pi-reconcile/logs/) so failures
 * are debuggable after the fact; detached + unref so shutdown of pi never
 * waits on them.
 */

import { spawn } from "node:child_process";
import { mkdirSync, openSync } from "node:fs";
import { join } from "node:path";

export interface RunResult {
  started: boolean;
  reason?: "cooldown" | "spawn-error";
  detail?: string;
  logFile?: string;
}

const lastRun = new Map<string, number>();

export function lastRunAt(key: string): number | undefined {
  return lastRun.get(key);
}

export function runBackground(
  key: string,
  command: string,
  args: string[],
  cwd: string,
  logDir: string,
  minIntervalMs: number,
): RunResult {
  const now = Date.now();
  if (now - (lastRun.get(key) ?? 0) < minIntervalMs) {
    return { started: false, reason: "cooldown" };
  }
  lastRun.set(key, now);

  try {
    mkdirSync(logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logFile = join(logDir, `${key}-${stamp}.log`);
    const fd = openSync(logFile, "a");
    const child = spawn(command, args, { cwd, detached: true, stdio: ["ignore", fd, fd] });
    child.unref();
    return { started: true, logFile };
  } catch (err) {
    return { started: false, reason: "spawn-error", detail: String(err) };
  }
}
