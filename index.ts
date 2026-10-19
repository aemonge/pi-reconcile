/**
 * pi-reconcile — reconcile derived artifacts at openspec work boundaries.
 *
 *   task completed (checkbox flip)  → graphify update   (if dirty & stale)
 *   change archived (dir move)      → engram sync --cloud
 *   session end                     → engram sync (idempotent fallback)
 *   no openspec in repo             → dirty flag → graphify at agent_end
 *
 * Deliberately NOT part of the pi-openspec-gate: the gate fails closed
 * (blocks work), this fails open (background syncs, never blocks). The gate's
 * *model* (tasks/changes) is the trigger system; its *code* is untouched.
 * Boundaries are read from the openspec directory itself — see boundaries.ts.
 *
 * Event/context shapes verified against
 * @earendil-works/pi-coding-agent@1.3.0 dist/core/extensions/types.d.ts.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { defaultPolicy, loadPolicy, type SyncPolicy } from "./policy.ts";
import * as boundaries from "./boundaries.ts";
import { isGraphStale } from "./staleness.ts";
import { graphFreshUntilAt, hydrateGraphFreshUntil, hydrateLastRun, keyLogs, lastRunAt, loadPersistedState, logTailLine, runBackground, savePersistedState, setGraphFreshUntil, setPersistedSnapshot } from "./executors.ts";

interface ReconcileState {
  policy: SyncPolicy;
  dirty: boolean;
  snap: boundaries.BoundarySnapshot | null;
}

export default function reconcile(pi: ExtensionAPI) {
  const state: ReconcileState = { policy: defaultPolicy, dirty: false, snap: null };

  /** Keep the runtime snapshot and the persisted snapshot in lockstep. */
  const setSnap = (s: boundaries.BoundarySnapshot | null) => {
    state.snap = s;
    setPersistedSnapshot(s);
  };

  const notify = (ctx: { hasUI: boolean; ui: { notify: (m: string, t?: "info" | "warning" | "error") => void } }, msg: string) => {
    if (ctx.hasUI) ctx.ui.notify(msg, "info");
  };

  const graphify = (cwd: string) => {
    const g = state.policy.graphify;
    if (!g.enabled) return { started: false };
    const r = runBackground(
      "graphify", "graphify", ["update", "."],
      cwd, join(cwd, state.policy.logDir), g.minIntervalMs,
    );
    if (r.started) {
      // Single choke point for the staleness fresh-window: every spawn
      // (boundary, session_start_stale, manual /reconcile) just rebuilt the
      // graph — mtime can't move inside one cooldown interval.
      setGraphFreshUntil(Date.now() + g.minIntervalMs);
    }
    return r;
  };

  const engramSync = (cwd: string) => {
    const e = state.policy.engram;
    if (!e.enabled) return { started: false };
    const project = e.project ?? process.env.ENGRAM_PROJECT;
    const cloud = e.mode === "cloud" && Boolean(project);
    const args = cloud
      ? ["sync", "--cloud", "--project", project as string]
      : ["sync"]; // local export to .engram/ — still useful when cloud is unconfigured
    return runBackground(
      "engram", "engram", args,
      cwd, join(cwd, state.policy.logDir), e.minIntervalMs,
    );
  };

  /** Shared boundary logic: fire syncs from a diff, return what fired. */
  const applyBoundaries = async (
    cwd: string,
    hasUI: { hasUI: boolean; ui: { notify: (m: string, t?: "info" | "warning" | "error") => void } },
  ): Promise<string[]> => {
    const fired: string[] = [];
    const now = await boundaries.snapshot(cwd);
    const d = state.snap ? boundaries.diff(state.snap, now) : { present: now.present, tasksCompleted: 0, newArchives: [] };
    setSnap(now);

    const g = state.policy.graphify;
    if (g.enabled) {
      const taskBoundary = d.present && d.tasksCompleted > 0 && g.when.includes("task_complete");
      const fallback = !d.present && state.dirty && g.when.includes("agent_end_dirty");
      if (taskBoundary || fallback) {
        const stale = g.guard === "none" ? true : await isGraphStale(cwd, g.codeExtensions, graphFreshUntilAt());
        const staleOk = stale !== false; // "unknown" → allow; cooldown protects us
        const dirtyOk = g.guard !== "dirty_and_stale" || state.dirty || taskBoundary;
        if (staleOk && dirtyOk) {
          const r = graphify(cwd);
          if (r.started) {
            fired.push(`graphify (${taskBoundary ? "task complete" : "dirty"})`);
            notify(hasUI, `pi-reconcile: ${fired[fired.length - 1]} → graphify update`);
          }
        }
      }
    }

    const e = state.policy.engram;
    if (e.enabled && d.newArchives.length > 0 && e.when.includes("change_archive")) {
      const r = engramSync(cwd);
      if (r.started) {
        fired.push(`engram (${d.newArchives.length} archived)`);
        notify(hasUI, `pi-reconcile: change archived → engram sync`);
      }
    }
    return fired;
  };

  pi.on("session_start", async (_event, ctx) => {
    const cwd = ctx.cwd;
    state.policy = await loadPolicy(cwd);
    if (!state.policy.enabled) return;
    state.dirty = false;

    // Cooldowns survive restarts; cross-session replay fires boundaries
    // crossed while pi was closed. Missing/corrupt state → skip
    // silently (fail-open).
    const persisted = await loadPersistedState(cwd);
    hydrateLastRun(persisted?.lastRun ?? {});
    hydrateGraphFreshUntil(persisted?.graphFreshUntil);
    if (persisted && state.policy.crossSession !== false) {
      setSnap(persisted.snapshot); // diff baseline; applyBoundaries snapshots fresh
      try {
        await applyBoundaries(cwd, ctx);
      } catch {
        /* fail-open: replay errors never reach the session */
      }
    } else {
      setSnap(await boundaries.snapshot(cwd));
    }

    const g = state.policy.graphify;
    if (g.enabled && g.when.includes("session_start_stale")) {
      const stale = await isGraphStale(cwd, g.codeExtensions, graphFreshUntilAt());
      if (stale === true) {
        const r = graphify(cwd);
        if (r.started) notify(ctx, "pi-reconcile: stale graph → graphify update");
      }
    }
  });

  pi.on("tool_result", (event) => {
    if (!state.policy.enabled) return; // disabled policy: no dirty tracking at all
    if (state.policy.toolClasses.code.includes(event.toolName)) state.dirty = true;
  });

  pi.on("agent_end", async (_event, ctx) => {
    // Reload first so mid-session sync-policy.json edits are live within one
    // run end (one JSON read per run — accepted cost, plan item 4).
    state.policy = await loadPolicy(ctx.cwd);
    if (!state.policy.enabled) return;
    try {
      await applyBoundaries(ctx.cwd, ctx);
    } catch {
      /* fail-open: boundary errors never reach the session */
    }
    state.dirty = false;
  });

  pi.on("session_shutdown", async (event, ctx) => {
    // Teardown fires for quit AND reload/new/resume/fork — the latter are
    // runtime switches, not session ends, but state must persist on any of
    // them, so the diff + save below run for every reason.
    console.log(`[pi-reconcile] session_shutdown reason=${event.reason}`);
    if (!state.policy.enabled) return;
    try {
      // Final diff catches boundaries that landed outside agent runs
      await applyBoundaries(ctx.cwd, ctx);
      // Session_end fallback is for actual quits only — switches/reloads
      // resume in another runtime and re-fire their own boundaries.
      // DECIDED INTERPRETATION (plan-a wording "quit OR cooldown" was
      // ambiguous): strict quit-gate; runBackground's cooldown stays the
      // inherent second guard.
      if (event.reason === "quit" && state.policy.engram.enabled && state.policy.engram.when.includes("session_end")) {
        engramSync(ctx.cwd);
      }
    } catch {
      /* fail-open */
    }
    // Persist {snapshot, lastRun} for the next session — best-effort, fail-open.
    await savePersistedState(ctx.cwd);
  });

  pi.registerCommand("reconcile", {
    description: "Force artifact sync (graphify + engram), or `/reconcile status`",
    handler: async (args: string, ctx) => {
      const cwd = ctx.cwd;
      state.policy = await loadPolicy(cwd);
      if (args.trim() === "status") {
        const s = state.snap;
        const ago = (key: string) => {
          const t = lastRunAt(key);
          return t ? `${Math.round((Date.now() - t) / 1000)}s ago` : "never";
        };
        notify(
          ctx,
          `pi-reconcile: enabled=${state.policy.enabled} · dirty=${state.dirty} · ` +
            `openspec=${s?.present ? `yes (${s.checkedTasks} checked)` : "no"} · ` +
            `graphify last=${ago("graphify")} · engram last=${ago("engram")}`,
        );
        const logDir = join(cwd, state.policy.logDir);
        const logsOf = (key: string): string => {
          const names = keyLogs(logDir, key).slice(-3); // newest 3, oldest → newest
          if (names.length === 0) return `${key}: logs: none`;
          const tail = logTailLine(join(logDir, names[names.length - 1]));
          return `${key}: ${names.join(", ")}${tail ? ` · last: ${tail}` : ""}`;
        };
        notify(ctx, `pi-reconcile logs: ${logsOf("graphify")} · ${logsOf("engram")}`);
        return;
      }
      const rg = graphify(cwd);
      const re = engramSync(cwd);
      notify(
        ctx,
        `pi-reconcile: graphify=${rg.started ? "started" : (rg.reason ?? "off")} · ` +
          `engram=${re.started ? "started" : (re.reason ?? "off")}`,
      );
    },
  });
}
