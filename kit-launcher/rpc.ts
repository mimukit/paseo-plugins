import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

// The workspace `diffStat` counts the branch diff against the base ref, so it
// stays above zero after a commit. The pill needs the working tree state, which
// only `git status` reports, so the daemon answers that question per directory.
export const gitStatus = defineRpc({
  name: "git.status",
  input: z.object({ cwd: z.string().min(1) }),
  output: z.object({ dirty: z.boolean() }),
});
