import {
  gitWorktreePorcelain,
  paseoOwnedWorktreeRoot,
  resolvePath,
} from "./paseo";

export interface Worktree {
  path: string;
  branch: string;
}

function isUnder(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

/**
 * Every worktree of a repo, wherever it sits on disk. Git is the authority
 * here, so this works for any tool that ran `git worktree add`.
 *
 * Three kinds are dropped: the main checkout (the first record, which Paseo
 * already tracks as the project), detached-HEAD worktrees (no branch to name a
 * row after), and anything under `~/.paseo/worktrees` (Paseo owns those).
 */
export async function listWorktrees(repoRoot: string): Promise<Worktree[]> {
  const stdout = await gitWorktreePorcelain(repoRoot);

  const raw: { path: string; branch: string }[] = [];
  let path: string | null = null;
  let branch: string | null = null;
  let detached = false;

  const flush = () => {
    if (path !== null && branch !== null && !detached) {
      raw.push({ path, branch });
    }
    path = null;
    branch = null;
    detached = false;
  };

  for (const line of stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      flush();
      path = line.slice("worktree ".length).trim();
    } else if (line.startsWith("branch ")) {
      branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    } else if (line.trim() === "detached") {
      detached = true;
    }
  }
  flush();

  const mainCheckout = await resolvePath(repoRoot);
  const ownedRoot = await paseoOwnedWorktreeRoot();

  const found: Worktree[] = [];
  for (const entry of raw) {
    const absolute = await resolvePath(entry.path);
    if (absolute === mainCheckout) continue;
    if (isUnder(absolute, ownedRoot)) continue;
    found.push({ path: absolute, branch: entry.branch });
  }
  return found;
}
