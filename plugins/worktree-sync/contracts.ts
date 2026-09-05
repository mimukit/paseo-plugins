import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const SyncEntrySchema = z.object({
  path: z.string(),
  branch: z.string(),
  project: z.string(),
});

export const SyncStatusSchema = z.object({
  registered: z.array(SyncEntrySchema),
  tombstoned: z.array(SyncEntrySchema),
  alreadyRegistered: z.array(SyncEntrySchema),
  errors: z.array(z.string()),
  finishedAt: z.string().nullable(),
  running: z.boolean(),
});

export type SyncStatus = z.infer<typeof SyncStatusSchema>;

/** Last pass result. Never starts a pass of its own. */
export const getSyncStatus = defineRpc({
  name: "worktree-sync.get-status",
  input: z.object({}),
  output: SyncStatusSchema,
});

/** Force a pass now and return its result. */
export const syncNow = defineRpc({
  name: "worktree-sync.sync-now",
  input: z.object({}),
  output: SyncStatusSchema,
});
