import type { PluginContext } from "@getpaseo/plugin";
import { getSyncStatus, syncNow } from "./contracts";
import { SyncPanel } from "./main.client";
import { SyncService } from "./service";

export default function contribute(plugin: PluginContext) {
  const service = new SyncService();

  plugin.handle(getSyncStatus, async () => service.status());
  plugin.handle(syncNow, async () => service.syncNow());

  plugin.addSurface("main", SyncPanel);

  plugin.addSidebarItem({
    id: "worktree-sync-sidebar",
    title: "Worktree Sync",
    icon: "GitBranch",
    surface: "main",
  });

  plugin.addCommandCenterItem({
    id: "worktree-sync-now",
    title: "Worktree Sync — sync worktrees now",
    icon: "RefreshCw",
    keywords: ["worktree", "sync", "paseo", "workspace", "register"],
    context: "global",
    async onSelect(context) {
      await context.rpc(syncNow, {});
      context.openSurface("main");
    },
  });

  service.start();

  return () => {
    service.stop();
  };
}
