import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginHandlerContext, PluginServerContext } from "@getpaseo/plugin/server";
import { isWorkingTreeDirty } from "./server/git";
import { gitStatus } from "./shared/rpc";

/**
 * The daemon checks the requested directory against the live agents before it
 * spawns git. Without this gate, any client code could probe any path on the
 * machine and learn whether it is a dirty git repository.
 */
async function isAgentCwd(context: PluginHandlerContext, cwd: string): Promise<boolean> {
  const result = await context.paseo.agents.list();
  for (const { agent } of result?.entries ?? []) {
    if (agent.status !== "closed" && agent.cwd === cwd) return true;
  }
  return false;
}

export default function contribute(server: PluginServerContext): PluginCleanup {
  server.handle(gitStatus, async (input, context) => {
    if (!(await isAgentCwd(context, input.cwd))) return { dirty: false };
    return { dirty: await isWorkingTreeDirty(input.cwd) };
  });

  return () => {};
}
