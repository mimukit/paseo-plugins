import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { sendKit, startPillTracker } from "./client/tracker";
import { KITS } from "./shared/kits";

export default function contribute(client: PluginClientContext): PluginCleanup {
  const cleanups: PluginCleanup[] = KITS.map((kit) =>
    client.addCommandCenterItem({
      id: `kit-launcher-${kit.id}`,
      title: kit.title,
      icon: kit.icon,
      keywords: kit.keywords,
      context: "agent",
      onSelect(context) {
        sendKit(client, context.agent.id, kit.id);
      },
    }),
  );

  cleanups.push(startPillTracker(client));

  return () => {
    for (const cleanup of cleanups) void cleanup();
  };
}
