# Plan: Kit launcher
Grilled: 2026-09-01

## Context

Every session in Paseo starts the same way: I type a slash command for a skill. `/plankit`, `/implementkit #42`, `/reviewkit`, `/commitkit`. On the desktop that is a few keystrokes. On the phone it is slow and error-prone, and a mistyped kit name silently becomes prose.

The kit launcher puts each kit one search or one tap away. It is the first plugin in this repo for two reasons. It is client-only, so it needs no RPC contract and no server state, and it teaches the Command Center, composer pill, and agent lifecycle APIs before the panel plugins depend on them.

Success means three things. I can reach any kit from the Command Center by name or keyword. Three kits sit on composer pills and start the kit in one tap. The plugin loads, typechecks, and survives `paseo plugin reload kit-launcher` without leaking a pill or a subscription.

## Design decisions (settled)

| Decision | Resolution |
| --- | --- |
| What selecting a kit does | Send `/<kit>` to the agent at once, via `paseo.agents.ref(agentId).send(text)`. Paseo 0.7.0 has no composer-prefill API (verified against `paseo-plugin.d.ts` and the `@getpaseo/client` 0.4.0 typings), so fill-and-wait is not buildable. Direct send is safe because each kit is interactive and asks for its own input. A mis-tap costs one wasted turn. |
| Kits that take an argument | Send the bare command. implementkit resolves its input by its own precedence rule (prompt, then CLAUDE.md, then repo habit) or asks. No argument UI. |
| Where the kit list comes from | A hardcoded typed table inside the plugin. No filesystem read, no server handler. |
| Grouping in Command Center search | Every entry carries `kit` in its keywords, so typing "kit" lists the whole set. Titles stay clean. |
| Composer pills | Three: plankit, implementkit, commitkit. Kept in v1 despite the lifecycle cost, because the phone is the point. Not configurable. |
| Pill mechanics | A pill binds to one agent. `PluginComposerPillContribution` requires `workspaceId`, `agentId`, and a React `Component`, so the plugin subscribes to agent lifecycle through `paseo.agents.subscribe`, adds three pills per live agent, and removes them when the agent closes. |
| Plugin id and directory | `kit-launcher`, scaffolded with `paseo plugin init kit-launcher --id kit-launcher`. |

## Approach

Reuse everything the runtime already gives. React comes from Paseo, so the plugin adds no dependency. `addCommandCenterItem` supplies the searchable list; `addClientSide` supplies `addComposerPill` and the `paseo` client for the agent subscription. The architecture doc's rule holds here: the skill defines the behaviour, the plugin only writes the invocation.

Three files. `kits.ts` holds the table and stays free of React. `index.ts` registers the Command Center items and the client-side contribution, and returns one cleanup that unsubscribes the agent listener and calls every outstanding pill cleanup. `pills.client.tsx` holds the pill component, which the contribution type requires.

The kit table shape:

```ts
type Kit = {
  id: string;          // "plankit"
  title: string;       // "plankit — plan a feature"
  icon: string;
  keywords: string[];  // ["kit", "plan", "prd", "spec", "brainstorm"]
};
```

Ten kits ship in the first table: plankit, grillkit, issuekit, implementkit, reviewkit, qakit, prkit, statuskit, commitkit, debugkit.

### Rejected alternatives

- **Fill the composer and wait.** The original design. No API on 0.7.0 exposes composer text; the only primitive is `send`. Revisit if Paseo ships a prefill API.
- **Read `~/.claude/skills` at load.** Always current, but needs a server RPC and a filesystem dependency. Revisit once a panel plugin has proved the RPC path.
- **A single "kits" surface.** Duplicates what Command Center search already does.

### Phase 1: scaffold and load (built 2026-09-01)

Run `paseo plugin init kit-launcher --id kit-launcher`. Install from the local checkout, confirm it appears in `paseo plugin ls`, and confirm `paseo plugin logs kit-launcher` shows a clean load. Strip the example surface the scaffold writes. Log the runtime shape of `paseo` once, to confirm `agents.ref(...).send` and `agents.subscribe` exist at runtime as the client typings promise. Run `pnpm typecheck`.

Verifiable: the plugin loads, logs the expected `paseo` surface, and logs nothing at error level.

### Phase 2: the kit table and Command Center entries (built 2026-09-01)

Write `kits.ts` with the ten kits, each with `kit` plus keywords drawn from the skill's own description, so searching "worktree" finds gitkit and searching "next move" finds statuskit. Register one `addCommandCenterItem` per kit, context `agent`, each `onSelect` sending `/<id>` to `context.agent.id`. Confirm the entries appear only when an agent is focused.

Verifiable: each of the ten kits is reachable by name, by a keyword, and by "kit", and selecting one starts that kit on the focused agent.

### Phase 3: composer pills with agent lifecycle (built 2026-09-01)

Register `addClientSide`. Subscribe to `paseo.agents.subscribe`, and keep a map from agent id to the three pill cleanups. Add pills for plankit, implementkit and commitkit when an agent appears; run the cleanups when it closes. The plugin cleanup unsubscribes and drains the map. Reload twice and confirm the pill row holds exactly three pills per agent, with no duplicates.

Verifiable: three pills per live agent, each tap starts its kit on that agent, and a reload leaves exactly three.

### Phase 4: mobile pass and README (built 2026-09-01)

Check the pill row on a phone-width screen. Confirm the pill component uses `theme.colors.foreground` and honours `layout.compact` rather than fixed values. Write `kit-launcher/README.md` from `docs/wiki/plugin-readme-template.md`, and add the row to the plugin table in the repo `README.md`.

Verifiable: `pnpm typecheck` passes in `kit-launcher/`, and the pills are legible in both themes at phone width.

## Open questions

- **Does the runtime `paseo` object match the `@getpaseo/client` `PaseoClient` shape?** The scaffold's `paseo-plugin.d.ts` imports `PaseoApi` from `@getpaseo/client`, but the installed 0.4.0 typings do not export that name, so typecheck resolves it loosely. Phase 1 logs the runtime shape before Phase 3 builds on it.

## Non-goals

- No composer prefill; the API does not exist on 0.7.0.
- No reading of installed skills from disk, and no detection of which kits exist on this machine.
- No argument input UI, no issue picker, no plan-file picker. The docs attachment source (IDEAS.md item 4) covers pointing an agent at a document.
- No server code, no RPC contract, no cache.
- No panel, no surface, and no pill configuration.
- No changes to the kits themselves. The plugin sends the invocation and nothing else.
