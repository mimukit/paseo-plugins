import type { PluginContext } from "@getpaseo/plugin";
import { getUsage } from "./contracts";
import { UsagePanel } from "./main.client";
import { getUsageCached } from "./usage";

export default function contribute(plugin: PluginContext) {
  plugin.handle(getUsage, async (input) => getUsageCached(input.force ?? false));

  plugin.addSurface("main", UsagePanel);

  plugin.addSidebarItem({
    id: "claude-usage-sidebar",
    title: "Claude Usage",
    icon: "Gauge",
    surface: "main",
  });

  plugin.addWorkspacePanel({
    id: "claude-usage-panel",
    title: "Claude Usage",
    icon: "Gauge",
    context: "workspace",
    Component: UsagePanel,
  });

  plugin.addCommandCenterItem({
    id: "claude-usage-open",
    title: "Claude Usage — show rate limits",
    icon: "Gauge",
    keywords: ["usage", "limit", "rate", "quota", "claude"],
    context: "global",
    onSelect(context) {
      context.openSurface("main");
    },
  });

  return () => {};
}
