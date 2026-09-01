# Reference

Declared surface only: the plugin manifest, the `PluginContext` methods, and the `paseo plugin` commands. Types come from `paseo-plugin.d.ts`, which `paseo plugin init` writes into each plugin directory. When Paseo changes version, regenerate a scaffold and check this page against the new declarations.

## Manifest

`<plugin-dir>/paseo-plugin.json`:

| Key | Required | Notes |
| --- | --- | --- |
| `id` | yes | The only required key. In this repo it equals the directory name. |

## Scaffold files

`paseo plugin init <dir> --id <id>` writes:

| File | Purpose |
| --- | --- |
| `paseo-plugin.json` | Manifest |
| `package.json` | Dev dependencies and the `typecheck` script |
| `tsconfig.json` | Strict, `noEmit`, `jsx: react-jsx`, bundler resolution |
| `paseo-plugin.d.ts` | Type declarations for `@getpaseo/plugin` and its submodules |
| `index.ts` | Default-exports `contribute(plugin)` |
| `main.client.tsx` | An example surface |

## PluginContext

The object passed to `contribute`. Ten methods.

| Method | Purpose |
| --- | --- |
| `handle(contract, handler)` | Register a server-side RPC handler for a `defineRpc` contract |
| `addSurface(id, Component)` | Register a full screen |
| `addSidebarItem(contribution)` | Add an entry to the sidebar |
| `addWorkspacePanel(contribution)` | Add a panel inside a workspace |
| `addCommandCenterItem(contribution)` | Add a searchable command |
| `addClientSide(contribution)` | Run client-only setup, including `addComposerPill` |
| `addAttachmentSource(contribution)` | Feed the composer attachment picker |
| `addTheme(contribution)` | Register a theme |
| `addTimelineTransformer(contribution)` | Rewrite a timeline item before render |
| `addTimelineRenderer(contribution)` | Render a custom timeline item |

`contribute` returns a `PluginCleanup`, which is `() => void | Promise<void>`.

## Command center items

A contribution carries `id`, `title`, `icon`, optional `keywords`, a `context`, and an `onSelect` handler. The context decides what `onSelect` receives.

| Context | `onSelect` receives |
| --- | --- |
| `global` | `paseo`, `rpc(contract, input)`, `openSurface(id)` |
| `workspace` | the above, plus `workspace` and `openPanel(id, options?)` |
| `agent` | the above, plus `agent` |

`addClientSide` receives a client context with the same capabilities, plus `addComposerPill(contribution)` and `openPanel(id, options)`. `addComposerPill` returns a cleanup function.

## Server module

`@getpaseo/plugin/server` exports:

| Export | Purpose |
| --- | --- |
| `defineRpc({ name, input, output })` | Build a typed contract from two Zod schemas |
| `defineAttachmentSource(definition)` | Build an attachment source contribution |
| `PluginAttachmentItemSchema` | Zod schema for one attachment item |
| `PluginAttachmentSearchPayloadSchema` | Zod schema for a search result payload |

An attachment source declares `id`, `title`, `icon`, `pickerTitle`, `searchPlaceholder`, and a `search` contract. An attachment item carries `id`, `identifier`, `title`, optional `subtitle`, `url`, `text`, and `resourceType`.

## paseo plugin commands

Verified against Paseo 0.7.0.

| Command | Purpose |
| --- | --- |
| `init <directory>` | Create a typecheckable local plugin. `--id <id>` sets the manifest id, defaulting to the directory name. |
| `install <source>` | Install from a host directory, an `owner/repo` shorthand, or a Git URL. `--ref <ref>`, `--path <path>`, `--id <id>`. |
| `ls` | List configured plugins |
| `logs <id>` | Show recent plugin output |
| `reload <id>` | Reload a plugin |
| `enable <id>` / `disable <id>` | Turn a plugin on or off, keeping its configuration |
| `remove <id>` | Remove the plugin configuration |
| `status [id]` | Check Git-managed plugins for source updates |
| `update [id]` | Update a Git-managed plugin. `--all` updates every one. |

Every command except `init` accepts `--host <host>`, taking `host:port`, `tcp://host:port` or `ssh://user@host`. Without it the CLI uses the local socket, then `localhost:6767`. Every command accepts `--json`.

_Verified against `main`@`c4b0a58` on 2026-09-01._
