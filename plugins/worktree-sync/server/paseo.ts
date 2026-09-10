// `contribute` is bundled for the client as well as the daemon, and the client
// bundle stubs the node builtins. Anything imported at module scope is
// evaluated on load there, which is what `(0, import_node_util.promisify) is
// not a function` was: a stub `node:util` with no `promisify` on it. So this
// module keeps every node import dynamic and inside a function. Type-only
// imports are safe, because they are erased before the bundler sees them.

/** True only in the daemon. The client bundle has no node runtime. */
export function isNodeRuntime(): boolean {
  return (
    typeof process !== "undefined" &&
    typeof process.versions === "object" &&
    process.versions !== null &&
    typeof process.versions.node === "string"
  );
}

// A hung CLI must not wedge the single-flight pass forever, so every spawn
// carries a hard timeout. The buffer is sized for large project and worktree
// listings; the node default of 1 MB throws on big fleets.
const RUN_TIMEOUT_MS = 30_000;
const RUN_MAX_BUFFER = 16 * 1024 * 1024;

async function run(file: string, args: string[]): Promise<{ stdout: string }> {
  const { execFile } = await import("node:child_process");
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

async function paseoHome(): Promise<string> {
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");
  return join(homedir(), ".paseo");
}

/** Worktrees Paseo creates itself. The plugin never registers these. */
export async function paseoOwnedWorktreeRoot(): Promise<string> {
  const { join } = await import("node:path");
  return join(await paseoHome(), "worktrees");
}

/** `path.resolve`, reached the same lazy way as everything else here. */
export async function resolvePath(path: string): Promise<string> {
  const { resolve } = await import("node:path");
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
  const { readFile } = await import("node:fs/promises");
  const { join, resolve } = await import("node:path");
  const file = join(await paseoHome(), "projects", "workspaces.json");

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
  const { resolve } = await import("node:path");
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
  const { resolve } = await import("node:path");
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
  const { stat } = await import("node:fs/promises");
  try {
    const info = await stat(path);
    return info.birthtimeMs || null;
  } catch {
    return null;
  }
}
