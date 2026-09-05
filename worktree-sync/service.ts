// Type-only, so it is erased before the client bundle is built. Every runtime
// node import in this file is dynamic, for the reason paseo.ts explains.
import type { FSWatcher } from "node:fs";

import { gitCommonDir, isNodeRuntime, listProjects } from "./paseo";
import { reconcile, type ReconcileResult } from "./reconcile";
import type { SyncStatus } from "./contracts";

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

/**
 * Owns every timer and watcher the plugin holds. One instance per load, and
 * `stop()` must release all of it, or a reload leaves the old timers running.
 */
export class SyncService {
  private watchers = new Map<string, FSWatcher>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private backoffTimer: ReturnType<typeof setTimeout> | null = null;
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;
  private running = false;
  private pending: Promise<ReconcileResult> | null = null;
  private last: ReconcileResult | null = null;

  /**
   * No-op outside the daemon. `contribute` also runs in the client bundle,
   * where there is no node runtime to spawn git or read the registry.
   */
  start(): void {
    if (!isNodeRuntime()) return;
    this.intervalTimer = setInterval(() => {
      void this.pass("interval");
    }, INTERVAL_MS);
    void this.startupPass(0);
  }

  stop(): void {
    this.stopped = true;
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.backoffTimer) clearTimeout(this.backoffTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.debounceTimer = null;
    this.backoffTimer = null;
    this.intervalTimer = null;
  }

  status(): SyncStatus {
    const last = this.last;
    return {
      registered: last?.registered ?? [],
      tombstoned: last?.tombstoned ?? [],
      alreadyRegistered: last?.alreadyRegistered ?? [],
      errors: last?.errors ?? [],
      finishedAt: last?.finishedAt ?? null,
      running: this.running,
    };
  }

  /** The RPC entry point. Joins a pass already in flight instead of racing it. */
  async syncNow(): Promise<SyncStatus> {
    await this.pass("manual");
    return this.status();
  }

  /**
   * The first pass decides whether the daemon is reachable at all, so it gets
   * three retries. After that the interval is the only retry there needs to be.
   */
  private async startupPass(attempt: number): Promise<void> {
    if (this.stopped) return;
    const result = await this.pass("startup");
    const failed = result === null || result.errors.length > 0;
    if (!failed || attempt >= BACKOFF_MS.length) return;
    const delay = BACKOFF_MS[attempt] ?? 0;
    console.warn(`${LOG_PREFIX} startup pass failed, retrying in ${delay}ms`);
    this.backoffTimer = setTimeout(() => {
      void this.startupPass(attempt + 1);
    }, delay);
  }

  /** Single-flight. A second caller awaits the pass already running. */
  private async pass(reason: string): Promise<ReconcileResult | null> {
    if (this.stopped) return null;
    if (this.pending) return this.pending;

    this.running = true;
    this.pending = reconcile();
    try {
      const result = await this.pending;
      this.last = result;
      for (const entry of result.registered) {
        console.log(
          `${LOG_PREFIX} registered ${entry.path} (${entry.branch}) in ${entry.project}`,
        );
      }
      for (const error of result.errors) {
        console.error(`${LOG_PREFIX} ${error}`);
      }
      console.log(`${LOG_PREFIX} ${reason} pass: ${summarize(result)}`);
      await this.refreshWatchers();
      return result;
    } catch (error) {
      console.error(`${LOG_PREFIX} ${reason} pass threw:`, error);
      return null;
    } finally {
      this.running = false;
      this.pending = null;
    }
  }

  private schedulePass(): void {
    if (this.stopped) return;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.pass("watch");
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
  private async refreshWatchers(): Promise<void> {
    if (this.stopped || !isNodeRuntime()) return;
    const { existsSync, watch } = await import("node:fs");
    const { join } = await import("node:path");
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

    for (const [dir, watcher] of this.watchers) {
      if (wanted.has(dir)) continue;
      watcher.close();
      this.watchers.delete(dir);
    }

    for (const [dir, only] of wanted) {
      if (this.watchers.has(dir) || this.stopped) continue;
      try {
        const watcher = watch(dir, { recursive: false }, (_event, filename) => {
          if (only !== null && filename !== only) return;
          this.schedulePass();
        });
        watcher.on("error", () => {
          watcher.close();
          this.watchers.delete(dir);
        });
        this.watchers.set(dir, watcher);
      } catch (error) {
        console.error(`${LOG_PREFIX} cannot watch ${dir}:`, error);
      }
    }
  }
}
