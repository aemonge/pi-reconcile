/**
 * Policy: which tool calls dirty the repo, and which boundaries fire which sync.
 *
 * Loaded from `<project root>/sync-policy.json` (merged over defaults).
 * JSON keeps this extension dependency-free; swap in a `yaml` loader later
 * if the format starts to hurt.
 */

export type GraphifyWhen = "task_complete" | "session_start_stale" | "agent_end_dirty";
export type EngramWhen = "change_archive" | "session_end" | "session_start";

export interface GraphifyConfig {
  enabled: boolean;
  /** Boundaries that may trigger a graph rebuild. */
  when: GraphifyWhen[];
  /**
   * "dirty_and_stale": only run when code-writing tools ran AND the graph is
   *   actually out of date. Safest default.
   * "stale": ignore the dirty flag (staleness check alone decides).
   * "none": always run when a boundary fires.
   */
  guard: "dirty_and_stale" | "stale" | "none";
  /** Cooldown between rebuilds. */
  minIntervalMs: number;
  /** Regex alternation of extensions that count as code for staleness. */
  codeExtensions: string;
}

export interface EngramConfig {
  enabled: boolean;
  when: EngramWhen[];
  /** `engram sync --cloud --project X`. Falls back to local sync when unset. */
  project?: string;
  mode: "cloud" | "local";
  minIntervalMs: number;
}

export interface SyncPolicy {
  enabled: boolean;
  /** Tool-name → class map. Tools in `code` set the dirty flag. */
  toolClasses: { code: string[]; memory: string[]; docs: string[] };
  graphify: GraphifyConfig;
  engram: EngramConfig;
  /** Logs of spawned syncs, relative to the project root. */
  logDir: string;
}

export const defaultPolicy: SyncPolicy = {
  enabled: true,
  toolClasses: {
    code: ["write", "edit", "bash", "powershell", "apply_patch"],
    memory: ["mem_save", "mem_update", "mem_delete"],
    docs: ["read", "grep", "find", "ls"],
  },
  graphify: {
    enabled: true,
    when: ["task_complete", "session_start_stale", "agent_end_dirty"],
    guard: "dirty_and_stale",
    minIntervalMs: 5 * 60_000,
    codeExtensions: "ts|js|tsx|jsx|mjs|cjs|py|go|rs|java|rb|php|cs|c|cpp|h|hpp|sh|md",
  },
  engram: {
    enabled: true,
    when: ["change_archive", "session_end"],
    project: undefined,
    mode: "cloud",
    minIntervalMs: 60_000,
  },
  logDir: ".pi-reconcile/logs",
};

function merge<T extends Record<string, unknown>>(base: T, over: Partial<T> | undefined): T {
  if (!over) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/** Load `sync-policy.json` from the project root over the defaults. */
export async function loadPolicy(cwd: string): Promise<SyncPolicy> {
  const defaults = defaultPolicy;
  try {
    const fs = await import("node:fs/promises");
    const raw = JSON.parse(
      await fs.readFile(`${cwd}/sync-policy.json`, "utf8"),
    ) as Partial<SyncPolicy>;
    return {
      ...merge(defaults as unknown as Record<string, unknown>, raw as Record<string, unknown>),
      toolClasses: merge(defaults.toolClasses, raw.toolClasses),
      graphify: merge(defaults.graphify, raw.graphify),
      engram: merge(defaults.engram, raw.engram),
    } as SyncPolicy;
  } catch {
    return defaults; // no policy file, unreadable, or invalid → defaults
  }
}
