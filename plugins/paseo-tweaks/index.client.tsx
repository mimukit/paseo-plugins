import type { PluginCleanup } from "@getpaseo/plugin";
import { settingsRpc } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { TweaksSettingsScreen } from "./client/settings-screen";
import { registerUsageTweak } from "./client/usage/register";
import { DEFAULT_SETTINGS, SETTINGS_ID, TweakSettingsSchema } from "./shared/settings";
import { TWEAKS, type TweakId } from "./shared/tweaks";

/** One entry per tweak. A new tweak adds a line here and a line in TWEAKS. */
const REGISTER: Record<
  TweakId,
  (client: PluginClientContext, settings: typeof DEFAULT_SETTINGS) => PluginCleanup
> = {
  usage: (client, settings) => registerUsageTweak(client, settings.usage.binaryPath),
};

/**
 * `useSettings` is a hook, so `contribute` cannot call it. The read contract is
 * callable, and there is no subscription behind it, which is why a changed
 * switch needs `paseo plugin reload paseo-tweaks`.
 */
async function readSettings(client: PluginClientContext): Promise<typeof DEFAULT_SETTINGS> {
  try {
    const result = await client.rpc(settingsRpc(SETTINGS_ID).read, {});
    if (result.status !== "ready") return DEFAULT_SETTINGS;
    const parsed = TweakSettingsSchema.safeParse(result.values);
    return parsed.success ? parsed.data : DEFAULT_SETTINGS;
  } catch (error) {
    console.error("[paseo-tweaks] settings read failed", error);
    return DEFAULT_SETTINGS;
  }
}

function isEnabled(settings: typeof DEFAULT_SETTINGS, id: TweakId): boolean {
  return settings[id].enabled;
}

export default function contribute(client: PluginClientContext): PluginCleanup {
  const cleanups: PluginCleanup[] = [
    client.addSettingsScreen({
      id: "paseo-tweaks",
      title: "Paseo Tweaks",
      icon: "SlidersHorizontal",
      Component: TweaksSettingsScreen,
    }),

    // Paseo 0.8.0 reaches a plugin settings screen only from a row on the
    // Plugins page, and a plugin cannot move that row. This opens the same
    // screen from the command center instead.
    client.addCommandCenterItem({
      id: "paseo-tweaks-settings",
      title: "Paseo Tweaks — settings",
      icon: "SlidersHorizontal",
      keywords: ["tweaks", "usage", "settings", "paseo"],
      context: "global",
      onSelect(context) {
        context.openSettings("paseo-tweaks");
      },
    }),
  ];

  // The settings read is async and `contribute` is not. A reload that lands
  // before the read returns must not leave a tweak registered behind it.
  let stopped = false;

  void readSettings(client).then((settings) => {
    if (stopped) return;
    for (const tweak of TWEAKS) {
      if (!isEnabled(settings, tweak.id)) continue;
      cleanups.push(REGISTER[tweak.id](client, settings));
    }
  });

  return () => {
    stopped = true;
    for (const cleanup of cleanups) void cleanup();
  };
}
