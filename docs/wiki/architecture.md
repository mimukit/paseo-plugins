# Architecture

How a Paseo plugin is put together, and why the pieces sit where they do.

## Two entry points

A plugin has one entry per runtime, and the filenames are fixed. `index.client.tsx` registers everything the reader sees:

```tsx
import type { PluginClientContext } from "@getpaseo/plugin/client";
import { MainSurface } from "./client/main";

export default function contribute(client: PluginClientContext) {
  client.addSurface("main", MainSurface);
  return () => {};
}
```

`index.server.ts` registers everything that touches the machine:

```ts
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { listWorktrees } from "./shared/contracts";
import { readWorktrees } from "./server/worktrees";

export default function contribute(server: PluginServerContext) {
  server.handle(listWorktrees, async (input) => ({
    worktrees: await readWorktrees(input.workspacePath),
  }));
  return () => {};
}
```

A plugin may ship either entry or both. Each `contribute` runs once per load, registers what the plugin adds, and returns a cleanup function. Paseo calls that cleanup on reload and on removal, so anything with a lifetime goes there: timers, file watchers, subscriptions. A cleanup that forgets a timer leaves the old timer running after the next `paseo plugin reload`.

## Two runtimes, one directory

A plugin spans two places at once.

**The daemon** runs `index.server.ts` and everything under `server/`. It has the filesystem, the shell, and the network. This is where a panel's data comes from.

**The client** runs `index.client.tsx` and everything under `client/`. Paseo renders those components on desktop, in the browser, on iOS and on Android from the same source.

**`shared/`** holds what both import: RPC contracts, Zod schemas, plain data. Nothing in it may reach a runtime API.

The split is by directory, and the loader enforces it. A `node:` import reached from the client bundle is a load error, not a runtime stub, and so is a `client/` module imported from `server/`. A code module left at the plugin root is rejected outright.

React, React Native, TanStack Query and Zod are supplied by the runtime. A plugin that bundles its own copy is fighting the loader.

## Talking across the split

A client component cannot run `git`. A daemon handler cannot render. Typed RPC joins them, and Zod holds both ends to the same shape.

Define the contract once, in `shared/`, where both sides import it. `defineRpc` comes from the package root for exactly this reason: a `@getpaseo/plugin/server` import in a shared file would drag server-only code into the client bundle and fail the load.

```ts
import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const listWorktrees = defineRpc({
  name: "listWorktrees",
  input: z.object({ workspacePath: z.string() }),
  output: z.object({ worktrees: z.array(WorktreeSchema) }),
});
```

Register the handler in the server entry:

```ts
server.handle(listWorktrees, async (input, { paseo }) => {
  return { worktrees: await readWorktrees(input.workspacePath) };
});
```

Call it from a command or a client component with `rpc(listWorktrees, { workspacePath })`. The contract object is the shared reference, so a change to the schema breaks typecheck on both sides at once instead of failing at runtime on one.

## What a plugin can add

`PluginClientContext` exposes twelve registration methods, listed in the [reference](reference.md). They fall into three groups.

**Surfaces and panels** are the pieces a reader sees: `addSurface` for a full screen, `addWorkspacePanel` for a panel inside a workspace, `addSidebarItem` for an entry in the sidebar.

**Commands** are the pieces a reader triggers: `addCommandCenterItem` for a searchable command, `addSlashCommand` for a composer command, and `addComposerPill` for a tap target above the composer. A command declares its context as `global`, `workspace` or `agent`, and receives a matching context object. A workspace command gets `workspace` and `openPanel`; an agent command gets `agent` as well.

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

_Verified against Paseo 0.8.0 on 2026-09-10._
