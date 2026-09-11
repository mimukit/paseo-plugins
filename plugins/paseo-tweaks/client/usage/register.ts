import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { makeUsagePopover } from "./popover";

type PaseoApi = PluginClientContext["paseo"];
type Handler<Api extends { subscribe(handler: never): unknown }> = Parameters<
  Parameters<Api["subscribe"]>[0]
>[0];

/** Discriminated on `kind`, the same shape the kit-launcher tracker consumes. */
type WorkspaceUpdate = Handler<PaseoApi["workspaces"]>;

/**
 * One header button per live workspace. The button is icon-only and runs
 * nothing until its popover opens, so the cost of a workspace is a registration
 * and no process.
 *
 * A header button needs a `workspaceId`, so the viewer is unreachable with no
 * workspace open. That is accepted for version one.
 */
export function registerUsageTweak(client: PluginClientContext, binaryPath: string): PluginCleanup {
  const Content = makeUsagePopover(binaryPath);
  const buttons = new Map<string, PluginButtonRegistration>();

  // The host drops this installation's buttons before it awaits the cleanup
  // below. An add after that point outlives the installation and never comes
  // off the header, so every add stops at this flag.
  let stopped = false;

  const removeButton = (workspaceId: string) => {
    const button = buttons.get(workspaceId);
    if (!button) return;
    buttons.delete(workspaceId);
    button.remove();
  };

  const addButton = (workspaceId: string) => {
    if (stopped || buttons.has(workspaceId)) return;
    buttons.set(
      workspaceId,
      client.addHeaderButton({
        id: `paseo-tweaks-usage-${workspaceId}`,
        workspaceId,
        button: {
          title: "Usage",
          icon: "Gauge",
          behavior: { kind: "popover", Content },
        },
      }),
    );
  };

  client.paseo.workspaces
    .list()
    .then((result) => {
      for (const workspace of result?.entries ?? []) addButton(workspace.id);
    })
    .catch((error: unknown) => console.error("[paseo-tweaks] workspace list failed", error));

  const unsubscribe = client.paseo.workspaces.subscribe((update: WorkspaceUpdate) => {
    // The remove branch carries the workspace id as `id`; the upsert branch
    // nests the snapshot. Both are the same discriminated union.
    if (update.kind === "remove") removeButton(update.id);
    else addButton(update.workspace.id);
  });

  return () => {
    stopped = true;
    unsubscribe();
    for (const workspaceId of [...buttons.keys()]) removeButton(workspaceId);
  };
}
