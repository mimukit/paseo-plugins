import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { SyncPanel } from "./client/main";
import { syncNow } from "./shared/contracts";

export default function contribute(client: PluginClientContext): PluginCleanup {
  const cleanups: PluginCleanup[] = [
    client.addSurface("main", SyncPanel),

    client.addSidebarItem({
      id: "worktree-sync-sidebar",
      title: "Worktree Sync",
      icon: "GitBranch",
      surface: "main",
    }),

    client.addCommandCenterItem({
      id: "worktree-sync-now",
      title: "Worktree Sync — sync worktrees now",
      icon: "RefreshCw",
      keywords: ["worktree", "sync", "paseo", "workspace", "register"],
      context: "global",
      async onSelect(context) {
        await context.rpc(syncNow, {});
        context.openSurface("main");
      },
    }),
  ];

  return () => {
    for (const cleanup of cleanups) void cleanup();
  };
}
