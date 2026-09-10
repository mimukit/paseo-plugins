import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// A hung CLI must not wedge the single-flight pass forever, so every spawn
// carries a hard timeout. The buffer is sized for large project and worktree
// listings; the node default of 1 MB throws on big fleets.
const RUN_TIMEOUT_MS = 30_000;
const RUN_MAX_BUFFER = 16 * 1024 * 1024;

function run(file: string, args: string[]): Promise<{ stdout: string }> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      file,
      args,
      { timeout: RUN_TIMEOUT_MS, maxBuffer: RUN_MAX_BUFFER },
      (error, stdout) => {
        if (error) reject(error);
        else resolvePromise({ stdout: stdout.toString() });
      },
    );
  });
}

function paseoHome(): string {
  return join(homedir(), ".paseo");
}

/** Worktrees Paseo creates itself. The plugin never registers these. */
export function paseoOwnedWorktreeRoot(): string {
  return join(paseoHome(), "worktrees");
}

export function resolvePath(path: string): string {
  return resolve(path);
}

export interface PaseoProject {
  projectId: string;
  rootPath: string;
  name: string;
}

/**
 * One registry read. Active and archived rows both matter: `workspace create`
 * is not idempotent, and `paseo workspace ls` hides the archived half.
 */
export interface RegistrySnapshot {
  activePaths: Set<string>;
  /** Absolute cwd -> most recent `archivedAt` for that path. */
  tombstones: Map<string, string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Read `~/.paseo/projects/workspaces.json` directly.
 *
 * Throws on a missing, unreadable, or unparseable file. Callers fail closed:
 * a pass that cannot prove what is already registered registers nothing,
 * because a stale read means duplicate rows.
 */
export async function readRegistry(): Promise<RegistrySnapshot> {
  const file = join(paseoHome(), "projects", "workspaces.json");

  const raw = await readFile(file, "utf8");
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${file} is not a JSON array`);
  }

  const activePaths = new Set<string>();
  const tombstones = new Map<string, string>();

  for (const entry of parsed) {
    if (!isRecord(entry)) continue;
    const cwd = asString(entry.cwd);
    if (!cwd) continue;
    const path = resolve(cwd);
    const archivedAt = asString(entry.archivedAt);
    if (archivedAt === null) {
      activePaths.add(path);
      continue;
    }
    const seen = tombstones.get(path);
    if (seen === undefined || archivedAt > seen) {
      tombstones.set(path, archivedAt);
    }
  }

  return { activePaths, tombstones };
}

/** Every project Paseo knows. This is the plugin's whole discovery anchor. */
export async function listProjects(): Promise<PaseoProject[]> {
  const { stdout } = await run("paseo", ["project", "ls", "--json"]);
  const parsed: unknown = JSON.parse(stdout);
  const rows = Array.isArray(parsed) ? parsed : [];

  const projects: PaseoProject[] = [];
  for (const entry of rows) {
    if (!isRecord(entry)) continue;
    if (asString(entry.archivedAt) !== null) continue;
    const projectId = asString(entry.projectId) ?? asString(entry.id);
    // The CLI reports `path`; the on-disk registry calls it `rootPath`.
    const rootPath = asString(entry.rootPath) ?? asString(entry.path);
    if (!projectId || !rootPath) continue;
    projects.push({
      projectId,
      rootPath: resolve(rootPath),
      name: asString(entry.name) ?? rootPath,
    });
  }
  return projects;
}

/**
 * Register one existing checkout as a workspace row.
 *
 * `--isolation local` adopts the checkout in place; Paseo introspects git for
 * the branch and the main repo root. `--project` is mandatory, or Paseo invents
 * a stray project rooted at the worktree.
 */
export async function createWorkspace(input: {
  path: string;
  projectId: string;
  title: string;
}): Promise<void> {
  await run("paseo", [
    "workspace",
    "create",
    "--isolation",
    "local",
    "--path",
    input.path,
    "--project",
    input.projectId,
    "--title",
    input.title,
    "--json",
  ]);
}

/** Absolute path of a repo's git common directory, which always exists. */
export async function gitCommonDir(repoRoot: string): Promise<string> {
  const { stdout } = await run("git", [
    "-C",
    repoRoot,
    "rev-parse",
    "--path-format=absolute",
    "--git-common-dir",
  ]);
  return resolve(stdout.trim());
}

/** One `git worktree list --porcelain`, kept here so all spawning lives together. */
export async function gitWorktreePorcelain(repoRoot: string): Promise<string> {
  const { stdout } = await run("git", [
    "-C",
    repoRoot,
    "worktree",
    "list",
    "--porcelain",
  ]);
  return stdout;
}

/** Directory creation time in ms, or null when the platform reports none. */
export async function directoryBirthtimeMs(path: string): Promise<number | null> {
  try {
    const info = await stat(path);
    return info.birthtimeMs || null;
  } catch {
    return null;
  }
}
