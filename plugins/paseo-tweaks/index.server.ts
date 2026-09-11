import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { tweakSettings } from "./shared/settings";
import { readUsage } from "./shared/usage/contract";
import { readUsageOnHost } from "./server/usage/run";

export default function contribute(server: PluginServerContext): PluginCleanup {
  server.registerSettings(tweakSettings);

  server.handle(readUsage, (input) =>
    readUsageOnHost({ fetch: input.fetch, binaryPath: input.binaryPath }),
  );

  return () => {};
}
