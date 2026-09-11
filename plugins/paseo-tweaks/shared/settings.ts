import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

export const SETTINGS_ID = "paseo-tweaks";

/**
 * One key per tweak, so a second tweak adds a key rather than a migration.
 * The scope is "host": each machine holds its own document, which is the whole
 * point here, because each host runs its own Claude Code account.
 */
export const TweakSettingsSchema = z.object({
  usage: z
    .object({
      enabled: z.boolean().default(true),
      /** Empty means "resolve `usage` on the daemon's PATH". */
      binaryPath: z.string().default(""),
    })
    .default({ enabled: true, binaryPath: "" }),
});

export type TweakSettings = z.output<typeof TweakSettingsSchema>;

export const DEFAULT_SETTINGS: TweakSettings = {
  usage: { enabled: true, binaryPath: "" },
};

export const tweakSettings = defineSettings({
  id: SETTINGS_ID,
  scope: "host",
  version: 1,
  schema: TweakSettingsSchema,
});
