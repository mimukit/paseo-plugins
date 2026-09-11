import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/**
 * One window of the usage report. The key set is open on purpose: Anthropic has
 * added windows before, and a strict pair would either drop a new one or fail
 * validation on the single host whose account has it.
 */
export const UsageWindowSchema = z.object({
  key: z.string(),
  label: z.string(),
  utilization: z.number(),
  resetsAtMs: z.number(),
});

export type UsageWindow = z.output<typeof UsageWindowSchema>;

export const UsageResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    fetchedAtMs: z.number(),
    windows: z.array(UsageWindowSchema),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["not-found", "failed", "timeout", "unparseable"]),
    detail: z.string(),
  }),
]);

export type UsageResult = z.output<typeof UsageResultSchema>;

/**
 * `fetch` forces the CLI to probe the API. A plain call lets the CLI apply its
 * own cache policy, so this plugin never keeps a second cache.
 *
 * `binaryPath` comes from the settings document. The client reads that document
 * anyway, to know whether the tweak is on, and `PluginHandlerContext` exposes no
 * settings reader on the server side, so the value travels with the call.
 */
export const readUsage = defineRpc({
  name: "usage.read",
  input: z.object({
    fetch: z.boolean().default(false),
    binaryPath: z.string().default(""),
  }),
  output: UsageResultSchema,
});
