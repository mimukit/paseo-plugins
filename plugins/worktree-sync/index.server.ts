import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { getSyncStatus, syncNow } from "./shared/contracts";
import { createSyncService } from "./server/service";

export default function contribute(server: PluginServerContext): PluginCleanup {
  const service = createSyncService();

  server.handle(getSyncStatus, async () => service.status());
  server.handle(syncNow, async () => service.syncNow());

  service.start();

  return () => {
    service.stop();
  };
}
