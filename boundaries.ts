/**
 * Boundary detection: derive openspec work boundaries from disk state,
 * with ZERO dependency on the pi-openspec-gate.
 *
 * The openspec directory IS the event stream:
 *   - `openspec/changes/<slug>/N-tasks.md` checkbox flips  → task completed
 *   - new dated dir under `openspec/changes/archive/`      → change archived
 *
 * We snapshot that state and diff it. No hooks into the gate needed; if the
 * gate ever grows an event bus, subscribing becomes an optimization (instant
 * instead of diff-detected), never a dependency.
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface BoundarySnapshot {
  /** true when openspec/changes exists in this project */
  present: boolean;
  /** total checked task boxes (`- [x]`) across all active changes */
  checkedTasks: number;
  /** names of archive entries (dated dirs) */
  archived: string[];
}

export interface BoundaryDiff {
  present: boolean;
  /** how many task boxes were checked since the previous snapshot */
  tasksCompleted: number;
  /** change dirs that appeared in archive/ since the previous snapshot */
  newArchives: string[];
}

const CHECKED_BOX = /^[ \t]*[-*][ \t]+\[x\]/gim;

async function countChecked(dir: string): Promise<number> {
  let checked = 0;
  const entries = await readdir(dir).catch(() => [] as string[]);
  for (const name of entries) {
    // ramona-plan layout: `4-tasks.md`; other schemas: `tasks.md`
    if (!/(^|[-_])tasks?\.md$/i.test(name)) continue;
    const text = await readFile(join(dir, name), "utf8").catch(() => "");
    checked += (text.match(CHECKED_BOX) ?? []).length;
  }
  return checked;
}

export async function snapshot(cwd: string): Promise<BoundarySnapshot> {
  const changesDir = join(cwd, "openspec", "changes");
  if (!existsSync(changesDir)) {
    return { present: false, checkedTasks: 0, archived: [] };
  }
  const archivesDir = join(changesDir, "archive");
  const archived = existsSync(archivesDir)
    ? (await readdir(archivesDir).catch(() => [] as string[]))
    : [];

  let checkedTasks = 0;
  for (const entry of await readdir(changesDir, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || entry.name === "archive") continue;
    checkedTasks += await countChecked(join(changesDir, entry.name));
  }
  return { present: true, checkedTasks, archived };
}

export function diff(prev: BoundarySnapshot, next: BoundarySnapshot): BoundaryDiff {
  if (!next.present) {
    return { present: false, tasksCompleted: 0, newArchives: [] };
  }
  const prevArchived = new Set(prev.archived);
  return {
    present: true,
    tasksCompleted: Math.max(0, next.checkedTasks - prev.checkedTasks),
    newArchives: next.archived.filter((a) => !prevArchived.has(a)),
  };
}
