# Plan: paseo-tweaks, starting with the usage viewer

Grilled: 2026-09-11

Drafted: 2026-09-11. Verified against `@getpaseo/plugin@0.8.0`.

## Goal

Read the Claude Code usage numbers for the host I am working on, without leaving Paseo and without opening a terminal. One tap on a workspace header button, a popover with the two windows, done.

The viewer is too small to be its own plugin. It is the first tweak in `paseo-tweaks`, a collection of small UI tweaks that each earn a line rather than a directory.

## The CLI it wraps

`usage` is a personal CLI on each machine. `usage --json` prints the utilization block:

```json
{
  "fetchedAtMs": 1789114028000,
  "utilization": {
    "five_hour": { "utilization": 1, "resets_at": "1789131600" },
    "seven_day": { "utilization": 64, "resets_at": "1789318800" }
  }
}
```

`resets_at` is a Unix second value in a string. The CLI keeps its own cache and re-probes the API after `USAGE_PROBE_MAX_AGE` seconds, default 120. `--fetch` probes regardless. `--no-fetch` never probes.

## Why one plugin per host is the whole design

Each of my three hosts is a separate machine with its own Claude Code account, so the numbers differ per host.

Paseo installs a plugin per daemon. `paseo plugin install --host ssh://user@devaloy-ovh` writes that host's config, that host's daemon runs `index.server.ts`, and the client mounts one contribution set per connected host with an `invoke` bound to that daemon (`PluginRpcProvider`, `dist/client/rpc-context.d.ts`). `PluginHostProps` carries `{ host: { id, label } }` for the same reason.

So a button contributed by the `devaloy-ovh` installation runs `usage` on `devaloy-ovh`. Routing is not written; it falls out of the install. Two consequences: the plugin is installed once per host, and `SettingsDefinition.scope` is the literal `"host"`, so each machine holds its own binary path.

## Settled decisions

| # | Decision | Answer |
| --- | --- | --- |
| Q1 | No workspace open | Accepted. A header button needs a `workspaceId`, so the viewer is unreachable on the home screen. Revisit only if it bites. |
| Q2 | Settings document | Ships in version one, with a per-tweak switch and the binary path, nested per tweak. |
| Q3 | Binary resolution | A setting whose empty default means bare `usage` on PATH. |
| Q4 | Popover body | Two rows, a cache-age line, a refresh button. Header reads `Usage · <host.label>`. |
| Q5 | Output schema | A window array with open keys, so an unknown window still renders. |
| Q6 | Open behaviour | Bare `usage --json`. The CLI owns the freshness policy; the plugin adds no second cache. |
| Q7 | Registry | A `TWEAKS` array both entries loop, mirroring `KITS` in kit-launcher. |
| Q8 | Enable switch | Read once at `contribute`. A change needs `paseo plugin reload paseo-tweaks`, stated in a settings hint. |
| Q9 | Refresh button | Runs `--fetch`. It is the manual override on the CLI's policy. |
| Q10 | Failures | A typed failure in the output schema, with a 10s spawn timeout. |
| Q11 | Docs | Plugin README from the template, plus a root README row. No new wiki page. |
| Q12 | Button ids | `paseo-tweaks-usage-${workspaceId}`, with a two-host QA step. |

## Layout

```
plugins/paseo-tweaks/
  paseo-plugin.json        id paseo-tweaks, requirements.paseo >=0.8.0
  index.client.tsx         loops TWEAKS, calls each registerClient
  index.server.ts          loops TWEAKS, calls each registerServer
  shared/
    tweaks.ts              TWEAKS: ids and defaults only
    settings.ts            defineSettings, scope "host", version 1
    usage/contract.ts      defineRpc + the Zod schemas
  client/
    usage/register.ts      workspace tracker, header button per workspace
    usage/popover.tsx      the popover body
    settings-screen.tsx    the switch and the path row
  server/
    usage/run.ts           spawn, parse, normalise
```

`shared/tweaks.ts` holds ids and defaults only. Each runtime imports its own register function directly, so no client module is reachable from the server bundle.

## The contract

```ts
export const readUsage = defineRpc({
  name: "readUsage",
  input: z.object({ fetch: z.boolean().default(false) }),
  output: z.discriminatedUnion("ok", [
    z.object({
      ok: z.literal(true),
      fetchedAtMs: z.number(),
      windows: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          utilization: z.number(),
          resetsAtMs: z.number(),
        }),
      ),
    }),
    z.object({
      ok: z.literal(false),
      reason: z.enum(["not-found", "failed", "timeout", "unparseable"]),
      detail: z.string(),
    }),
  ]),
});
```

The server derives `label` from `key`: `five_hour` becomes `5 hour`, `seven_day` becomes `7 day`, and an unknown key falls back to the key with underscores replaced by spaces. It converts `resets_at` to milliseconds, so the client only formats.

## The server handler

1. Read the settings document. Take `usage.binaryPath`, or `"usage"` when it is empty.
2. Spawn with arguments as an array: `[binary, "--json"]`, plus `"--fetch"` when `input.fetch` is true. Never a command string.
3. Kill at 10 seconds and return `reason: "timeout"`. The daemon may sit behind a slow link and `usage` probes the network.
4. `ENOENT` returns `reason: "not-found"` with the resolved command in `detail`.
5. A non-zero exit returns `reason: "failed"` with the first line of stderr.
6. A body that fails the schema returns `reason: "unparseable"`.

## The client

`registerClient` mirrors `plugins/kit-launcher/client/tracker.ts`. It subscribes to `paseo.workspaces`, registers one header button per live workspace, removes the button when the workspace goes, and guards every add behind a `stopped` flag so a late callback after a reload cannot leave a button behind. Cleanup removes every registration.

The button is icon-only: `icon: "Gauge"`, `title: "Usage"`, no `label`. Nothing runs until the popover opens.

`behavior` is `{ kind: "popover", Content }`. `Content` receives `PluginButtonContentProps`, which carries `theme`, `host`, `layout` and `close()`. It calls `useRpc(readUsage)` inside a TanStack Query with no background refetch, since the CLI holds the cache. One row per window: label, a bar, the percent, and the relative reset ("in 4h 51m"). Below them, the age of `fetchedAtMs` and a refresh button that re-runs with `fetch: true`.

Colours come from `theme.colors.foreground` and `theme.colors.foregroundMuted`. Padding honours `layout.compact`. The popover header reads `Usage · ${host.label}`, so three connected hosts stay distinguishable.

On `ok: false` the body renders one sentence naming the reason, the resolved command from `detail`, and a pointer to the binary-path setting.

## Settings

```ts
defineSettings({
  id: "paseo-tweaks",
  scope: "host",
  version: 1,
  schema: z.object({
    usage: z.object({
      enabled: z.boolean().default(true),
      binaryPath: z.string().default(""),
    }),
  }),
});
```

The settings screen uses `SettingsSwitch` and `SettingsInput` from `@getpaseo/plugin/client/ui`. The switch hint states that a change takes effect after `paseo plugin reload paseo-tweaks`. The path hint states that an empty value resolves `usage` on the daemon's PATH.

`contribute()` cannot call `useSettings`, which is a hook. It reads the document once through `client.rpc(settingsRpc("paseo-tweaks").read, {})` and skips a disabled tweak. There is no subscription on that path, which is why Q8 accepts the reload.

## Deviations found while building

**The daemon cannot read its own settings document.** `PluginHandlerContext` carries `paseo` and nothing else (`dist/server/contracts.d.ts`), and `settingsRpc(id)` builds contracts the host answers, not ones the plugin server can call. So `binaryPath` travels in the `readUsage` input, set by the client, which reads the document anyway to learn whether the tweak is on. Arguments still reach `execFile` as an array, so the value is a binary path and never a shell string.

**No TanStack Query.** It is not in the plugin's dependency set and no plugin in this repo imports it. The popover uses `useState` and `useEffect` with a mounted ref, matching `plugins/worktree-sync/client/main.tsx`.

**No `paseo plugin init`.** The `paseo` CLI is not installed on the build machine. The scaffold was copied from `plugins/kit-launcher`, which is a real 0.8 scaffold, then filled in.

## Build order (built 2026-09-11)

1. Scaffold: `paseo plugin init plugins/paseo-tweaks --id paseo-tweaks`.
2. `shared/settings.ts`, `shared/tweaks.ts`, `shared/usage/contract.ts`.
3. `server/usage/run.ts` and the handler in `index.server.ts`. Test it with `paseo plugin logs paseo-tweaks` before any UI exists.
4. `client/usage/popover.tsx`.
5. `client/usage/register.ts` and `index.client.tsx`.
6. `client/settings-screen.tsx`.
7. Plugin README from the template, with a tweak table. Root README row.
8. `pnpm typecheck` in `plugins/paseo-tweaks`.

## QA

Run these by hand. The two-host check is the one that cannot be skipped.

1. Install on two hosts. Connect both in one Paseo client. Open a workspace on each. Confirm each popover header names its own host and the numbers differ.
2. Compare each popover against `usage` run in a terminal on that same machine.
3. Clear the binary path, rename `usage` out of PATH on one host, and confirm the popover says `not-found` and names the command.
4. Set an absolute path on that host and confirm the popover recovers without a reload of Paseo itself.
5. Press refresh twice inside two minutes and confirm `fetchedAtMs` moves, which proves `--fetch` reached the API.
6. Turn the switch off, reload the plugin, and confirm the button is gone from every workspace.
7. Reload the plugin with a popover open and confirm no orphan button survives.
8. Check the popover on a phone in both themes.

## Open risks

**Workspace id uniqueness across hosts.** Button ids are keyed by `workspaceId` alone, because `contribute()` never receives host props. If two hosts can issue the same workspace id, two buttons collide. QA step 1 is the check.

**Extra usage windows.** The window array absorbs a new key, but the label fallback will read `opus 5 hour` rather than anything prettier. Acceptable until it appears.

**No live settings channel.** The reload requirement in Q8 is a limit of 0.8.0, not a choice. Recheck on the next SDK release for a settings subscription, and switch to `registration.update({ visible })` when one lands.
