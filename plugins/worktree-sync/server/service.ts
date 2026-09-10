import { existsSync, watch, type FSWatcher } from "node:fs";
import { join } from "node:path";

import { gitCommonDir, listProjects } from "./paseo";
import { reconcile, type ReconcileResult } from "./reconcile";
import type { SyncStatus } from "../shared/contracts";

/** A burst of git writes lands within a second or two. Coalesce it. */
const DEBOUNCE_MS = 2_000;

/** The net for missed events and for projects added since the last pass. */
const INTERVAL_MS = 5 * 60_000;

/** The daemon may outrun its own CLI socket at boot. Retry, then give up. */
const BACKOFF_MS = [5_000, 15_000, 60_000];

const LOG_PREFIX = "[worktree-sync]";

/** The one entry in a git common directory that this plugin cares about. */
const WORKTREES_DIR = "worktrees";

function summarize(result: ReconcileResult): string {
  return [
    `${result.registered.length} registered`,
    `${result.tombstoned.length} tombstoned`,
    `${result.alreadyRegistered.length} already registered`,
  ].join(", ");
}

export type SyncService = {
  start(): void;
  stop(): void;
  status(): SyncStatus;
  syncNow(): Promise<SyncStatus>;
};

/**
 * Owns every timer and watcher the plugin holds. One instance per load, and
 * `stop()` must release all of it, or a reload leaves the old timers running.
 */
export function createSyncService(): SyncService {
  const watchers = new Map<string, FSWatcher>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let backoffTimer: ReturnType<typeof setTimeout> | null = null;
  let intervalTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let running = false;
  let pending: Promise<ReconcileResult> | null = null;
  let last: ReconcileResult | null = null;

  function status(): SyncStatus {
    return {
      registered: last?.registered ?? [],
      tombstoned: last?.tombstoned ?? [],
      alreadyRegistered: last?.alreadyRegistered ?? [],
      errors: last?.errors ?? [],
      finishedAt: last?.finishedAt ?? null,
      running,
    };
  }

  /** Single-flight. A second caller awaits the pass already running. */
  async function pass(reason: string): Promise<ReconcileResult | null> {
    if (stopped) return null;
    if (pending) return pending;

    running = true;
    pending = reconcile();
    try {
      const result = await pending;
      last = result;
      for (const entry of result.registered) {
        console.log(
          `${LOG_PREFIX} registered ${entry.path} (${entry.branch}) in ${entry.project}`,
        );
      }
      for (const error of result.errors) {
        console.error(`${LOG_PREFIX} ${error}`);
      }
      console.log(`${LOG_PREFIX} ${reason} pass: ${summarize(result)}`);
      await refreshWatchers();
      return result;
    } catch (error) {
      console.error(`${LOG_PREFIX} ${reason} pass threw:`, error);
      return null;
    } finally {
      running = false;
      pending = null;
    }
  }

  function schedulePass(): void {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void pass("watch");
    }, DEBOUNCE_MS);
  }

  /**
   * Two non-recursive watchers per project, and no directory is ever created.
   *
   * The git common directory always exists, so watching it survives a repo with
   * no worktrees yet and catches `worktrees/` the moment git creates it. That
   * watcher only reacts to the `worktrees` entry, because the common directory
   * also churns on every commit and ref update. The second watcher sits on
   * `worktrees/` itself, where each add and remove actually lands.
   */
  async function refreshWatchers(): Promise<void> {
    if (stopped) return;
    let roots: string[];
    try {
      roots = (await listProjects()).map((project) => project.rootPath);
    } catch {
      return;
    }

    const wanted = new Map<string, string | null>();
    for (const root of roots) {
      try {
        const common = await gitCommonDir(root);
        wanted.set(common, WORKTREES_DIR);
        const nested = join(common, WORKTREES_DIR);
        if (existsSync(nested)) wanted.set(nested, null);
      } catch {
        // A project whose directory is gone stops being watchable. The next
        // pass picks it up again if it returns.
      }
    }

    for (const [dir, watcher] of watchers) {
      if (wanted.has(dir)) continue;
      watcher.close();
      watchers.delete(dir);
    }

    for (const [dir, only] of wanted) {
      if (watchers.has(dir) || stopped) continue;
      try {
        const watcher = watch(dir, { recursive: false }, (_event, filename) => {
          if (only !== null && filename !== only) return;
          schedulePass();
        });
        watcher.on("error", () => {
          watcher.close();
          watchers.delete(dir);
        });
        watchers.set(dir, watcher);
      } catch (error) {
        console.error(`${LOG_PREFIX} cannot watch ${dir}:`, error);
      }
    }
  }

  /**
   * The first pass decides whether the daemon is reachable at all, so it gets
   * three retries. After that the interval is the only retry there needs to be.
   */
  async function startupPass(attempt: number): Promise<void> {
    if (stopped) return;
    const result = await pass("startup");
    const failed = result === null || result.errors.length > 0;
    if (!failed || attempt >= BACKOFF_MS.length) return;
    const delay = BACKOFF_MS[attempt] ?? 0;
    console.warn(`${LOG_PREFIX} startup pass failed, retrying in ${delay}ms`);
    backoffTimer = setTimeout(() => {
      void startupPass(attempt + 1);
    }, delay);
  }

  return {
    start(): void {
      intervalTimer = setInterval(() => {
        void pass("interval");
      }, INTERVAL_MS);
      void startupPass(0);
    },

    stop(): void {
      stopped = true;
      for (const watcher of watchers.values()) watcher.close();
      watchers.clear();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (backoffTimer) clearTimeout(backoffTimer);
      if (intervalTimer) clearInterval(intervalTimer);
      debounceTimer = null;
      backoffTimer = null;
      intervalTimer = null;
    },

    status,

    /** The RPC entry point. Joins a pass already in flight instead of racing it. */
    async syncNow(): Promise<SyncStatus> {
      await pass("manual");
      return status();
    },
  };
}
