import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const UsageWindowSchema = z.object({
  id: z.string(),
  label: z.string(),
  usedPercentage: z.number().min(0).max(100),
  resetsAt: z.string().nullable(),
});

export type UsageWindow = z.infer<typeof UsageWindowSchema>;

export const getUsage = defineRpc({
  name: "claude-usage.get-usage",
  input: z.object({ force: z.boolean().optional() }),
  output: z.object({
    windows: z.array(UsageWindowSchema),
    fetchedAt: z.string().nullable(),
    error: z.string().nullable(),
  }),
});
