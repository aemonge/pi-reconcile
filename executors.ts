/**
 * Executors: spawn syncs as detached background processes. Fail-open by
 * contract — a failing sync logs and is reported, but never throws into the
 * session and never blocks work.
 *
 * Output goes to a per-run log file (default .pi-reconcile/logs/) so failures
 * are debuggable after the fact; detached + unref so shutdown of pi never
 * waits on them. Log growth is bounded: each spawn prunes its key's logs to
 * the newest 10 (keyLogs/pruneLogs); /reconcile status tails the newest one.
 *
 * This module also owns the runtime state file `~/.pi/agent/pi-reconcile-state.json`
 * (per-project entries keyed by cwd: { snapshot, lastRun, graphFreshUntil }): cooldowns and the
 * last boundary snapshot survive restarts without writing state into repos. index.ts hydrates at session_start and mirrors snapshot updates
 * via setPersistedSnapshot; every spawn and session_shutdown persist. All
 * state I/O is best-effort: validated reads (corrupt → treated as absent),
 * atomic writes (tmp file + rename, serialized), errors logged, never thrown.
 */

import { spawn } from "node:child_process";
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { BoundarySnapshot } from "./boundaries.ts";

export interface RunResult {
  started: boolean;
  reason?: "cooldown" | "spawn-error";
  detail?: string;
  logFile?: string;
}

/** Persisted cross-session state for one project (home file, keyed by cwd). */
export interface PersistedState {
  snapshot: BoundarySnapshot | null;
  lastRun: Record<string, number>;
  /** When set, the graph is known-fresh until this epoch-ms (staleness window). */
  graphFreshUntil?: number;
}

/**
 * State lives in ONE home-dir file — `~/.pi/agent/pi-reconcile-state.json`,
 * matching the pi agent home convention (auth.json, settings.json, …) —
 * keyed by absolute project path so repos stay free of runtime state:
 * `{ version: 1, projects: { "<abs cwd>": { snapshot, lastRun, graphFreshUntil?, updatedAt } } }`.
 * Corrupt file → treated as empty (fail-open, self-healing on next write).
 * Growth is bounded: the MAX_PROJECTS most recently updated entries survive.
 */
const STATE_HOME_DIR = join(homedir(), ".pi", "agent");
const STATE_FILE = "pi-reconcile-state.json";
const MAX_PROJECTS = 64;

interface StateEntry {
  snapshot: BoundarySnapshot | null;
  lastRun: Record<string, number>;
  updatedAt: number;
  graphFreshUntil?: number;
}

const lastRun = new Map<string, number>();
/** Snapshot embedded in every state write; kept current by index.ts. */
let persistedSnapshot: BoundarySnapshot | null = null;
/** Graph known-fresh until this epoch-ms; set after a graphify spawn. */
let graphFreshUntil: number | undefined;
/** Serializes state writes so renames land in submission order. */
let stateWrites: Promise<void> = Promise.resolve();

export function lastRunAt(key: string): number | undefined {
  return lastRun.get(key);
}

/** Epoch-ms until which the graphify graph is known-fresh, if set. */
export function graphFreshUntilAt(): number | undefined {
  return graphFreshUntil;
}

/**
 * Open the staleness fresh-window: graphify just rebuilt the graph, and a
 * no-op update leaves outputs untouched — until this timestamp, mtime
 * cannot move past graph.json. Persists via the regular save chain
 * (savePersistedState includes it in the entry upsert).
 */
export function setGraphFreshUntil(until: number): void {
  graphFreshUntil = until;
}

/** Hydrate the fresh-window from persisted state; max-merge like lastRun. */
export function hydrateGraphFreshUntil(until: number | undefined): void {
  if (until !== undefined) graphFreshUntil = Math.max(graphFreshUntil ?? 0, until);
}

export function stateFilePath(): string {
  return join(STATE_HOME_DIR, STATE_FILE);
}

/**
 * Hydrate cooldowns from persisted state. Conservative merge: keeps the
 * LONGER remaining cooldown of in-memory vs persisted (never widens a gap).
 */
export function hydrateLastRun(entries: Record<string, number>): void {
  for (const [key, at] of Object.entries(entries)) {
    lastRun.set(key, Math.max(lastRun.get(key) ?? 0, at));
  }
}

/** Keep the snapshot persisted alongside cooldowns in lockstep with state.snap. */
export function setPersistedSnapshot(snap: BoundarySnapshot | null): void {
  persistedSnapshot = snap;
}

function isValidSnapshot(v: unknown): v is BoundarySnapshot | null {
  if (v === null) return true;
  if (typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.present === "boolean" &&
    typeof s.checkedTasks === "number" &&
    Array.isArray(s.archived) &&
    s.archived.every((a) => typeof a === "string")
  );
}

function sanitizeLastRun(v: unknown): Record<string, number> {
  if (typeof v !== "object" || v === null) return {};
  const out: Record<string, number> = {};
  for (const [key, at] of Object.entries(v)) {
    if (typeof at === "number" && Number.isFinite(at)) out[key] = at;
  }
  return out;
}

/** Parse the home state file into validated per-project entries. */
function parseStateFile(raw: unknown): Record<string, StateEntry> {
  if (typeof raw !== "object" || raw === null) return {};
  const projects = (raw as Record<string, unknown>).projects;
  if (typeof projects !== "object" || projects === null) return {};
  const out: Record<string, StateEntry> = {};
  for (const [dir, entry] of Object.entries(projects)) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (!isValidSnapshot(e.snapshot)) continue;
    const updatedAt = typeof e.updatedAt === "number" && Number.isFinite(e.updatedAt) ? e.updatedAt : 0;
    const entryFreshUntil =
      typeof e.graphFreshUntil === "number" && Number.isFinite(e.graphFreshUntil) ? e.graphFreshUntil : undefined;
    out[dir] = { snapshot: e.snapshot, lastRun: sanitizeLastRun(e.lastRun), updatedAt, graphFreshUntil: entryFreshUntil };
  }
  return out;
}

/** Read this project's persisted state; null when missing or corrupt (fail-open — callers skip). */
export async function loadPersistedState(cwd: string): Promise<PersistedState | null> {
  try {
    const raw: unknown = JSON.parse(await readFile(stateFilePath(), "utf8"));
    const entry = parseStateFile(raw)[cwd];
    if (!entry) return null;
    return { snapshot: entry.snapshot, lastRun: entry.lastRun, graphFreshUntil: entry.graphFreshUntil };
  } catch {
    return null; // missing/unreadable/unparseable → "no previous state"
  }
}

/**
 * Best-effort atomic upsert of this project's {snapshot, lastRun} into the
 * home state file: re-read the current file (fresh merge keeps other
 * projects' entries alive across concurrent sessions), upsert our entry,
 * prune to the MAX_PROJECTS most recently updated, then tmp+rename write.
 * Writes are serialized; errors are logged, never thrown. The returned
 * promise resolves when THIS write has landed (or failed) — session_shutdown
 * awaits it so the write beats process exit (shutdown handlers are awaited:
 * runner.js:80-86 per research notes).
 */
export function savePersistedState(cwd: string): Promise<void> {
  const run = async (): Promise<void> => {
    try {
      let entries: Record<string, StateEntry> = {};
      try {
        const parsed: unknown = JSON.parse(await readFile(stateFilePath(), "utf8"));
        const version =
          typeof parsed === "object" && parsed !== null && typeof (parsed as { version?: unknown }).version === "number"
            ? (parsed as { version: number }).version
            : 1;
        if (version > 1) {
          // Never clobber a newer format we don't understand — keep the file.
          console.error(`[pi-reconcile] state file version ${version} > 1 — write skipped`);
          return;
        }
        entries = parseStateFile(parsed);
      } catch {
        /* missing/corrupt file → start fresh (self-healing) */
      }
      entries[cwd] = {
        snapshot: persistedSnapshot,
        lastRun: Object.fromEntries(lastRun),
        updatedAt: Date.now(),
        graphFreshUntil,
      };
      const kept = Object.entries(entries)
        .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
        .slice(0, MAX_PROJECTS);
      await mkdir(STATE_HOME_DIR, { recursive: true });
      const tmp = join(STATE_HOME_DIR, `${STATE_FILE}.${process.pid}.tmp`);
      const body = `${JSON.stringify({ version: 1, projects: Object.fromEntries(kept) })}\n`;
      await writeFile(tmp, body, "utf8");
      await rename(tmp, join(STATE_HOME_DIR, STATE_FILE));
    } catch (err) {
      console.error(`[pi-reconcile] state file write failed (ignored): ${String(err)}`);
    }
  };
  stateWrites = stateWrites.then(run, run);
  return stateWrites;
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
  void savePersistedState(cwd); // cooldown survives a restart; serialized, fail-open

  try {
    mkdirSync(logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logFile = join(logDir, `${key}-${stamp}.log`);
    const fd = openSync(logFile, "a");
    pruneLogs(logDir, key); // keep newest 10 per key, this one included; fail-open per file
    const child = spawn(command, args, { cwd, detached: true, stdio: ["ignore", fd, fd] });
    closeSync(fd); // child holds dup'd fds; parent's copy must not leak per spawn
    child.unref();
    return { started: true, logFile };
  } catch (err) {
    return { started: false, reason: "spawn-error", detail: String(err) };
  }
}

/** Log files kept per key; older ones are unlinked after each spawn. */
const KEEP_LOGS_PER_KEY = 10;

/**
 * This key's log basenames in logDir, oldest → newest. Filenames carry an
 * ISO-stamp prefix, so plain lexicographic sort is chronological.
 */
export function keyLogs(logDir: string, key: string): string[] {
  try {
    return readdirSync(logDir)
      .filter((f) => f.startsWith(`${key}-`) && f.endsWith(".log"))
      .sort();
  } catch {
    return []; // missing/unreadable logDir → no logs (fail-open)
  }
}

/**
 * Keep only the newest KEEP_LOGS_PER_KEY logs of a key — the just-created
 * one included, since it sorts newest. Each unlink in its own try/catch: a
 * stubborn file never breaks the spawn path (fail-open; next spawn retries).
 */
function pruneLogs(logDir: string, key: string): void {
  const logs = keyLogs(logDir, key);
  const excess = Math.max(0, logs.length - KEEP_LOGS_PER_KEY); // slice() would read a negative end as from-the-end!
  for (const victim of logs.slice(0, excess)) {
    try {
      unlinkSync(join(logDir, victim));
    } catch (err) {
      console.error(`[pi-reconcile] log prune failed (ignored): ${String(err)}`);
    }
  }
}

/**
 * Last non-empty line of a log file, capped for one-line display (~140
 * chars). Logs are small (0.7–2.5 s runs) — whole-file read is fine.
 * undefined when unreadable or wholly empty (fail-open).
 */
export function logTailLine(logFile: string): string | undefined {
  try {
    const lines = readFileSync(logFile, "utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line) return line.length > 140 ? `${line.slice(0, 139)}…` : line;
    }
  } catch {
    /* missing/unreadable → no tail (fail-open) */
  }
  return undefined;
}
