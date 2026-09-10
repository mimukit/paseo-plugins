# Reference

Declared surface only: the plugin manifest, the context methods, the import subpaths, and the `paseo plugin` commands. Types come from the `@getpaseo/plugin` package, which each plugin lists as a dev dependency. When Paseo changes version, regenerate a scaffold and check this page against the new declarations.

## Manifest

`<plugin-dir>/paseo-plugin.json`:

| Key | Required | Notes |
| --- | --- | --- |
| `id` | yes | In this repo it equals the directory name. |
| `requirements.paseo` | yes | A semver range, `">=0.8.0"` for anything written today. A manifest without it reads as pre-0.8 and Paseo 0.8 refuses to load the plugin. |

## Scaffold files

`paseo plugin init <dir> --id <id>` writes:

| File | Purpose |
| --- | --- |
| `paseo-plugin.json` | Manifest, including `requirements.paseo` |
| `package.json` | Dev dependencies, including `@getpaseo/plugin`, and the `typecheck` script |
| `tsconfig.json` | Strict, `noEmit`, `jsx: react-jsx`, bundler resolution |
| `index.client.tsx` | Default-exports `contribute(client)`. Name it `index.client.ts` when the entry holds no JSX. |
| `index.server.ts` | Default-exports `contribute(server)` |
| `client/greeting.tsx` | An example surface |
| `server/greeting.ts` | An example RPC handler |
| `shared/greeting.ts` | The contract both sides import |

There is no `paseo-plugin.d.ts`. The 0.8 scaffold depends on the real `@getpaseo/plugin` package instead.

## Import subpaths

The loader enforces these. An import from the wrong subpath fails the bundle, not the render.

| Subpath | Exports |
| --- | --- |
| `@getpaseo/plugin` | `defineRpc`, `defineSettings`, `defineAttachmentSource`, `PluginTheme`, `PluginCleanup`, and the plain data types |
| `@getpaseo/plugin/client` | `PluginClientContext`, `PluginSurfaceProps`, `usePaseo`, `useRpc`, `useSettings`, `useAgent`, `useWorkspace` |
| `@getpaseo/plugin/client/react-native` | `Icon`, `Modal`, `ScrollView`, `FlatList`, `TextInput`, `useToast`, `copyText` |
| `@getpaseo/plugin/client/ui` | UI components |
| `@getpaseo/plugin/server` | `PluginServerContext`, `PluginHandlerContext`, the lifecycle hook types |
| `@getpaseo/plugin/server/provider` | Provider registration |
| `@getpaseo/plugin/server/acp` | ACP authentication |

`defineRpc` sits at the root, not under `/server`, so a `shared/` contract file can import it without pulling server code into the client bundle.

## PluginServerContext

The object passed to `contribute` in `index.server.ts`.

| Method | Purpose |
| --- | --- |
| `handle(contract, handler)` | Register an RPC handler for a `defineRpc` contract |
| `registerSettings(definition)` | Register a settings document |
| `registerProvider(provider)` | Register an agent provider |

A handler receives `(input, context)`, where `context.paseo` is the daemon's `PaseoApi`.

## PluginClientContext

The object passed to `contribute` in the client entry. Twelve registration methods, plus `paseo`, `rpc(contract, input)`, `openSurface(id)`, `openSettings(id)` and `openPanel(id, options)`.

| Method | Purpose |
| --- | --- |
| `addSurface(id, Component)` | Register a full screen |
| `addSidebarItem(contribution)` | Add an entry to the sidebar |
| `addWorkspacePanel(contribution)` | Add a panel inside a workspace |
| `addSettingsScreen(contribution)` | Add a settings screen |
| `addCommandCenterItem(contribution)` | Add a searchable command |
| `addSlashCommand(contribution)` | Add a composer slash command |
| `addHeaderButton(contribution)` | Add a button to a workspace header |
| `addComposerPill(contribution)` | Add a tap target above the composer |
| `addAttachmentSource(contribution)` | Feed the composer attachment picker |
| `addTheme(contribution)` | Register a theme |
| `addTimelineTransformer(contribution)` | Rewrite a timeline item before render |
| `addTimelineRenderer(contribution)` | Render a custom timeline item |

Each returns a `PluginCleanup`, which is `() => void | Promise<void>`, except `addHeaderButton` and `addComposerPill`. Those two return a `PluginButtonRegistration` carrying `update(patch)` and `remove()`. `contribute` itself returns a `PluginCleanup`.

## Buttons and pills

`addHeaderButton` and `addComposerPill` take `id`, `workspaceId`, a `button`, and, for a pill, `agentId`. The `button` carries `title`, an `icon` that is either a Lucide name or a component, an optional `label` shown beside the icon, optional `visible` and `disabled`, and a `behavior`.

| Behavior kind | Fields |
| --- | --- |
| `action` | `onPress()` |
| `menu` | `items`, a list of separators and items, each item carrying its own `behavior` |
| `popover` | `Content`, a component rendered in the popover |

## Command center items

A contribution carries `id`, `title`, `icon`, optional `keywords`, a `context`, and an `onSelect` handler. The context decides what `onSelect` receives.

| Context | `onSelect` receives |
| --- | --- |
| `global` | `paseo`, `rpc(contract, input)`, `openSurface(id)` |
| `workspace` | the above, plus `workspace` and `openPanel(id, options?)` |
| `agent` | the above, plus `agent` |

A slash command takes `name`, `description`, `argumentHint`, a `context` of `workspace` or `agent`, and an `onSubmit` receiving the matching context plus `args`.

## Root module

`@getpaseo/plugin` exports:

| Export | Purpose |
| --- | --- |
| `defineRpc({ name, input, output })` | Build a typed contract from two Zod schemas |
| `defineSettings(definition)` | Build a settings document definition |
| `defineAttachmentSource(definition)` | Build an attachment source contribution |
| `PluginAttachmentItemSchema` | Zod schema for one attachment item |
| `PluginAttachmentSearchPayloadSchema` | Zod schema for a search result payload |

An attachment source declares `id`, `title`, `icon`, `pickerTitle`, `searchPlaceholder`, and a `search` contract. An attachment item carries `id`, `identifier`, `title`, optional `subtitle`, `url`, `text`, and `resourceType`.

## paseo plugin commands

Verified against Paseo 0.8.0.

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

_Verified against Paseo 0.8.0 on 2026-09-10._
