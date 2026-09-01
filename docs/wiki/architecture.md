# Architecture

How a Paseo plugin is put together, and why the pieces sit where they do.

## The entry point

`index.ts` default-exports one function:

```ts
import type { PluginContext } from "@getpaseo/plugin";
import { MainSurface } from "./main.client";

export default function contribute(plugin: PluginContext) {
  plugin.addSurface("main", MainSurface);
  return () => {};
}
```

`contribute` runs once per load. It registers everything the plugin adds and returns a cleanup function. Paseo calls that cleanup on reload and on removal, so anything with a lifetime goes there: timers, file watchers, subscriptions. A cleanup that forgets a timer leaves the old timer running after the next `paseo plugin reload`.

## Two runtimes, one directory

A plugin spans two places at once.

**The daemon** runs `index.ts` and every plain `.ts` file it imports. It has the filesystem, the shell, and the network. This is where a panel's data comes from.

**The client** runs the React components. Paseo renders them on desktop, in the browser, on iOS and on Android from the same source.

The split is by filename. Paseo keeps `*.client.tsx` out of the daemon bundle, so every component lives in one of those files and `index.ts` imports it. The naming convention is the whole mechanism; there is no separate build step and no configuration key.

React, React Native, TanStack Query and Zod are supplied by the runtime. A plugin that bundles its own copy is fighting the loader.

## Talking across the split

A client component cannot run `git`. A daemon handler cannot render. Typed RPC joins them, and Zod holds both ends to the same shape.

Define the contract once, in a file both sides import:

```ts
import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const listWorktrees = defineRpc({
  name: "listWorktrees",
  input: z.object({ workspacePath: z.string() }),
  output: z.object({ worktrees: z.array(WorktreeSchema) }),
});
```

Register the handler in `contribute`:

```ts
plugin.handle(listWorktrees, async (input, { paseo }) => {
  return { worktrees: await readWorktrees(input.workspacePath) };
});
```

Call it from a command or a client component with `rpc(listWorktrees, { workspacePath })`. The contract object is the shared reference, so a change to the schema breaks typecheck on both sides at once instead of failing at runtime on one.

## What a plugin can add

`PluginContext` exposes ten registration methods, listed in the [reference](reference.md). They fall into three groups.

**Surfaces and panels** are the pieces a reader sees: `addSurface` for a full screen, `addWorkspacePanel` for a panel inside a workspace, `addSidebarItem` for an entry in the sidebar.

**Commands** are the pieces a reader triggers: `addCommandCenterItem` for a searchable command, and `addComposerPill` (reached through `addClientSide`) for a tap target above the composer. A command declares its context as `global`, `workspace` or `agent`, and receives a matching context object. A workspace command gets `workspace` and `openPanel`; an agent command gets `agent` as well.

**Transforms** change what Paseo already renders: `addAttachmentSource` feeds the composer attachment picker, `addTheme` adds a theme, and the two timeline methods rewrite or render timeline items.

## The daemon is unsandboxed

Server code runs as the daemon user with full access to the machine. A plugin that shells out to `git` or `gh` has the same reach as your own shell.

That sets three rules for this repo:

**Never interpolate input into a command string.** Pass arguments as an array. A workspace path with a space or a semicolon in it is the ordinary case, not the attack case.

**Confirm before anything destructive.** Deleting a worktree or a branch needs a confirmation step and a refusal path for the dirty or unmerged case.

**Cache anything that shells out.** Three `gh` calls on every panel mount feels slow and burns API quota. TanStack Query is in the runtime; give it a stale time of a minute or more.

## Rendering rules

A panel renders on a phone and a desktop, in a light theme and a dark one. Use `theme.colors.foreground` and `theme.colors.foregroundMuted` rather than fixed colours, and honour `layout.compact` for padding. A hardcoded colour is invisible on one of the two themes.

## Where the rules live

Most of these plugins display state that a Claude Code skill already knows how to produce: gitkit defines when a worktree is safe to archive, statuskit defines how to rank the next move. The plugin shows the result and calls the rule. It does not restate the rule, because two copies of a rule drift.

_Verified against `main`@`c4b0a58` on 2026-09-01._
