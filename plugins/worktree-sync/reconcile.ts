import {
  createWorkspace,
  directoryBirthtimeMs,
  listProjects,
  readRegistry,
  type PaseoProject,
  type RegistrySnapshot,
} from "./paseo";
import { listWorktrees, type Worktree } from "./worktrees";

export interface ReconcileEntry {
  path: string;
  branch: string;
  project: string;
}

export interface ReconcileResult {
  /** Rows this pass created. */
  registered: ReconcileEntry[];
  /** Worktrees suppressed by a tombstone newer than the directory. */
  tombstoned: ReconcileEntry[];
  /** Worktrees that already had an active row. */
  alreadyRegistered: ReconcileEntry[];
  /** Per-project or per-worktree failures. The pass continues past each one. */
  errors: string[];
  finishedAt: string;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Decide whether a tombstoned path holds a worktree newer than the archive.
 *
 * Paths get reused: a worktree is torn down and archived, and months later a
 * new one lands on the same path. A directory created after its row was
 * archived is new work, not the archived work. Without a birthtime the answer
 * is unknowable, so the tombstone wins and the path stays suppressed.
 */
async function isNewerThanTombstone(
  path: string,
  archivedAt: string,
): Promise<boolean> {
  const archivedMs = Date.parse(archivedAt);
  if (Number.isNaN(archivedMs)) return false;
  const birthMs = await directoryBirthtimeMs(path);
  if (birthMs === null) return false;
  return birthMs > archivedMs;
}

async function classify(
  worktree: Worktree,
  registry: RegistrySnapshot,
): Promise<"registered" | "tombstoned" | "missing"> {
  if (registry.activePaths.has(worktree.path)) return "registered";
  const archivedAt = registry.tombstones.get(worktree.path);
  if (archivedAt === undefined) return "missing";
  return (await isNewerThanTombstone(worktree.path, archivedAt))
    ? "missing"
    : "tombstoned";
}

/**
 * One full sync pass: every project, every worktree, register what is missing.
 *
 * The pass only ever adds. Archiving a row also deletes its backing directory,
 * so removal stays a human decision outside this plugin.
 */
export async function reconcile(): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    registered: [],
    tombstoned: [],
    alreadyRegistered: [],
    errors: [],
    finishedAt: new Date().toISOString(),
  };

  let registry: RegistrySnapshot;
  try {
    registry = await readRegistry();
  } catch (error) {
    // Fail closed. Registering without a trustworthy registry read means
    // duplicate rows, which nothing in this plugin can undo.
    result.errors.push(`registry unreadable, skipping pass: ${message(error)}`);
    result.finishedAt = new Date().toISOString();
    return result;
  }

  let projects: PaseoProject[];
  try {
    projects = await listProjects();
  } catch (error) {
    result.errors.push(`cannot list projects: ${message(error)}`);
    result.finishedAt = new Date().toISOString();
    return result;
  }

  for (const project of projects) {
    let worktrees: Worktree[];
    try {
      worktrees = await listWorktrees(project.rootPath);
    } catch (error) {
      result.errors.push(`${project.name}: ${message(error)}`);
      continue;
    }

    for (const worktree of worktrees) {
      const entry: ReconcileEntry = {
        path: worktree.path,
        branch: worktree.branch,
        project: project.name,
      };
      const bucket = await classify(worktree, registry);
      if (bucket === "registered") {
        result.alreadyRegistered.push(entry);
        continue;
      }
      if (bucket === "tombstoned") {
        result.tombstoned.push(entry);
        continue;
      }

      // Re-read immediately before the create. The snapshot above can be
      // minutes old by now, and `workspace create` happily makes a second row
      // for a path that gained one in the meantime.
      try {
        const fresh = await readRegistry();
        if (fresh.activePaths.has(worktree.path)) {
          registry = fresh;
          result.alreadyRegistered.push(entry);
          continue;
        }
        await createWorkspace({
          path: worktree.path,
          projectId: project.projectId,
          title: worktree.branch,
        });
        registry.activePaths.add(worktree.path);
        result.registered.push(entry);
      } catch (error) {
        result.errors.push(`${worktree.path}: ${message(error)}`);
      }
    }
  }

  result.finishedAt = new Date().toISOString();
  return result;
}
