import { execFile } from "node:child_process";

// `git status --porcelain` prints one line per changed or untracked path and
// nothing at all for a clean tree, so the first byte of output is the answer.
// A non-git directory, a missing git, or a timeout all count as clean: the pill
// stays hidden rather than offering a commit the workspace cannot make.
export function isWorkingTreeDirty(cwd: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", cwd, "status", "--porcelain"],
      { timeout: 10_000, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout) => resolve(!error && stdout.trim().length > 0),
    );
  });
}
