# Plan: migrate both plugins to the Paseo 0.8 runtime entry system

Date: 2026-09-10
Source: <https://paseo.sh/docs/plugins/v0.8/migration>

## Verdict

Both plugins need migration. Neither loads on Paseo 0.8 as it stands.

| Plugin | Loads on 0.8 today | Why |
| --- | --- | --- |
| kit-launcher | No | No `requirements.paseo`, no runtime entry, `PluginContext`, `addClientSide`, `.client`/`.server` suffixes at the root |
| worktree-sync | No | Same, plus one module that runs `node:child_process` work inside a client-reachable path |

Every plugin in the repo is affected. There is no partial case.

## Blocker before any work starts

The CLI on this box is still 0.7.2:

```
$ paseo --version
0.7.2
```

The 0.8 update has not landed here. Migrated code cannot be loaded or reloaded until it does. Run `devaloy update` (or update the `npm-getpaseo-cli` mise tool) and confirm `paseo --version` reports 0.8.x before step 1. The typecheck steps below also need `@getpaseo/plugin@0.8`, which does not resolve while the toolchain is on 0.7.

## What 0.8 changes

Five changes drive the whole migration.

1. Entry files are fixed names. `index.client.tsx` and `index.server.ts`. A root `index.ts` no longer loads.
2. Suffixes become directories. `foo.client.tsx` becomes `client/foo.tsx`, `foo.server.ts` becomes `server/foo.ts`, shared code goes in `shared/`. Root-level code modules are rejected.
3. Registration splits by runtime. `plugin.handle` becomes `server.handle`. Every `plugin.addX` becomes `client.addX`. `addClientSide` is gone; its body becomes the client entry.
4. Import subpaths are enforced. `useRpc` from `@getpaseo/plugin/client`, `Icon` from `@getpaseo/plugin/client/react-native`, `PluginServerContext` from `@getpaseo/plugin/server`, `defineRpc` from the root `@getpaseo/plugin`.
5. The manifest must declare `"requirements": { "paseo": ">=0.8.0" }`. A missing field reads as `<0.8.0` and 0.8 rejects the plugin even after the files move.

The compiler now enforces the runtime boundary. A `node:` import reached from the client bundle is an error, not a runtime stub.

## Two facts to confirm on the real 0.8 package

Do this first, in step 1, because both change the file plan.

- The guide's mapping table puts `defineRpc` at the root, and its subpath list also names `defineRpc` under `/server`. The two disagree. Both plugins put `defineRpc` in a file the client imports, so the root subpath is the one that works. Confirm against the shipped `@getpaseo/plugin` 0.8 types and follow the package.
- `addComposerPill` is listed as moved "with updated structure". The guide does not print the new structure. Read the 0.8 type for it before rewriting the kit-launcher pill.

## Migration of worktree-sync

This one is the cleaner split. The runtime boundary already matches the file boundary.

### Target layout

```
plugins/worktree-sync/
  paseo-plugin.json
  package.json
  tsconfig.json
  index.client.tsx
  index.server.ts
  client/main.tsx
  server/paseo.ts
  server/reconcile.ts
  server/service.ts
  server/worktrees.ts
  shared/contracts.ts
```

### Steps

1. Move `contracts.ts` to `shared/contracts.ts`. Change its `defineRpc` import from `@getpaseo/plugin/server` to the root `@getpaseo/plugin`. This file is imported by the panel, so a `/server` import now fails the client bundle.
2. Move `paseo.ts`, `reconcile.ts`, `service.ts` and `worktrees.ts` into `server/`. Fix their relative imports of `contracts` to `../shared/contracts`.
3. Write `index.server.ts`. It creates the service, registers `server.handle(getSyncStatus, ...)` and `server.handle(syncNow, ...)`, calls `service.start()`, and returns the cleanup that calls `service.stop()`.
4. Move `main.client.tsx` to `client/main.tsx`. Change `useRpc` to `@getpaseo/plugin/client`, `Icon` to `@getpaseo/plugin/client/react-native`, and the `PluginHostProps` and `PluginTheme` types to `@getpaseo/plugin/client`.
5. Write `index.client.tsx`. It calls `client.addSurface("main", SyncPanel)`, `client.addSidebarItem(...)` and `client.addCommandCenterItem(...)` with the bodies moved unchanged from the old `index.ts`.
6. Add `"requirements": { "paseo": ">=0.8.0" }` to `paseo-plugin.json`.
7. Bump `@getpaseo/plugin` in `package.json` to the 0.8 release.
8. Delete the old `index.ts`.

### Simplification this unlocks

`server/paseo.ts` keeps every `node:` import dynamic and inside a function, and `server/service.ts` guards its work with `isNodeRuntime()`. Both exist for one reason the header comments state plainly: `contribute` was bundled for the client too, and the client stubbed the node builtins. In 0.8 that file is server-only and never reaches the client bundle.

Treat this as a separate follow-up, not part of the move:

- Convert the dynamic `await import("node:...")` calls in `server/paseo.ts` to plain top-level imports.
- Drop `isNodeRuntime()` and its call sites in `server/service.ts` and `server/paseo.ts`.
- The `createSyncService` closure can stay a closure. Its comment blames Hermes rejecting a class expression in the client bundle, which no longer applies, but a closure is fine and rewriting it buys nothing.

Land the move first and confirm it loads. Then do this cleanup as its own commit, so a load failure has one cause to look at.

## Migration of kit-launcher

This one is harder. Its client and server code are entangled in a single `index.ts`, and its types are hand-written.

### The type shim problem

`plugins/kit-launcher/paseo-plugin.d.ts` declares `@getpaseo/plugin/server` by hand. `package.json` depends on `@getpaseo/client` and `@getpaseo/protocol`, not on `@getpaseo/plugin` at all. The header comment in `index.ts` explains why: the scaffold's `PaseoApi` import resolved loosely against `@getpaseo/client` 0.4.0.

Under 0.8 this shim is a liability. It cannot describe the new `client`/`server` context split, and it will silently disagree with the real package. Replace it: add a real `@getpaseo/plugin` 0.8 dependency, delete `paseo-plugin.d.ts`, and let the typecheck report what the shim was hiding.

Expect real errors here, not a clean move. Budget for it.

### Target layout

```
plugins/kit-launcher/
  paseo-plugin.json
  package.json
  tsconfig.json
  index.client.tsx
  index.server.ts
  client/pills.tsx
  client/tracker.ts
  server/git.ts
  shared/kits.ts
  shared/rpc.ts
```

### Steps

1. Add `@getpaseo/plugin` 0.8 to `package.json` and delete `paseo-plugin.d.ts`. Drop `@getpaseo/client` and `@getpaseo/protocol` if nothing else needs them.
2. Move `rpc.ts` to `shared/rpc.ts` and switch `defineRpc` to the root import.
3. Move `kits.ts` to `shared/kits.ts`. It is plain data and both runtimes read it.
4. Move `git.server.ts` to `server/git.ts`. It needs no edit beyond its path.
5. Write `index.server.ts`. It holds the `git.status` handler and the `isAgentCwd` guard that gates it. Keep that guard. It is the only thing stopping arbitrary client code from probing any path on the machine, and the migration must not weaken it.
6. Move `pills.client.tsx` to `client/pills.tsx` and repoint `PluginComposerPillProps` at `@getpaseo/plugin/client`.
7. Move the whole `addClientSide` body from `index.ts` into `client/tracker.ts` as one exported function taking the client context. This is the agent tracking, the debounce, the backstop timer and the pill lifecycle, roughly 150 lines. Move it as-is; do not rewrite the logic during the move.
8. Write `index.client.tsx`. It registers the ten `client.addCommandCenterItem(...)` entries from `KITS`, calls the tracker function, and returns the tracker's cleanup as the plugin cleanup.
9. Add `"requirements": { "paseo": ">=0.8.0" }` to `paseo-plugin.json`.
10. Delete the old `index.ts`.

### What to re-examine once the real types are in

The `agentsApiOf` and `workspacesApiOf` probes exist because the shim could not describe the real API, so the code checks each method at runtime and warns when one is missing. With the real 0.8 types, check whether `client.paseo` types these surfaces properly. If it does, the probes become dead defensive code and should go. Decide this after the typecheck runs, not before.

`sendKit` and `isAgentCwd` both take `paseo: unknown`. Those signatures come from the same shim gap and get the same treatment.

## Order of work

1. Update the CLI to 0.8 and confirm the version. Read the shipped `@getpaseo/plugin` 0.8 types for `defineRpc` and `addComposerPill`.
2. Migrate worktree-sync. It is the smaller change and it proves the layout, the manifest field and the import subpaths against a real daemon.
3. Migrate kit-launcher, using what step 2 established.
4. Clean up worktree-sync's node-runtime workarounds.
5. Clean up kit-launcher's API probes, if the real types make them dead.

Steps 2 and 3 are separate commits. Steps 4 and 5 are separate again.

## Verification per plugin

Run in the plugin directory, in this order:

```sh
pnpm install
pnpm typecheck
paseo plugin install ~/projects/paseo-plugins/plugins/<id>
paseo plugin reload <id>
paseo plugin logs <id>
```

`pnpm typecheck` catches the boundary errors, because 0.8 enforces the client/server split at the compiler. A clean typecheck is the main gate. The reload and the logs confirm the manifest and the entry names, which the compiler cannot check.

Per-plugin behaviour to confirm by hand after reload:

- worktree-sync: the sidebar item opens the panel, the command center entry runs a pass, and the panel lists registered worktrees.
- kit-launcher: the ten kit entries appear in the command center against a focused agent, and the commitkit pill appears on the composer for an agent with a dirty working tree.

## Docs to update when the work lands

- `docs/wiki/reference.md` — extension points, manifest fields, the import subpaths.
- `docs/wiki/architecture.md` — the client/server split section, which now describes runtime bundles rather than one entry.
- `docs/wiki/how-to/add-a-plugin.md` — the layout a new plugin starts from.
- `docs/wiki/plugin-readme-template.md` — if it shows a file layout.
- `AGENTS.md` — the rule "Keep React components in `*.client.tsx`. Server code goes in `index.ts`" is now wrong and must state the directory layout instead.
- Both plugin READMEs, wherever they list files.
