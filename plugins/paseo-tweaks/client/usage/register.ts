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
 * The host validates a button id against `^[a-z][a-z0-9-]*$` and throws when it
 * does not match. A workspace id is `wks_98f55a52f5fdd326`, so the underscore
 * has to go. The mapping stays one-to-one, because only `_` is replaced.
 */
function buttonId(workspaceId: string): string {
  return `paseo-tweaks-usage-${workspaceId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
}

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
    try {
      buttons.set(
        workspaceId,
        client.addHeaderButton({
          id: buttonId(workspaceId),
          workspaceId,
          button: {
            title: "Usage",
            icon: "Gauge",
            behavior: { kind: "popover", Content },
          },
        }),
      );
    } catch (error) {
      // A throw here must not take the workspace subscription with it.
      console.error("[paseo-tweaks] header button add failed", workspaceId, error);
    }
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
