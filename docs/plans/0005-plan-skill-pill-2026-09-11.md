# Plan: skill-pill plugin

Drafted: 2026-09-11. Blocked on a Paseo API that does not exist yet. Working name `skill-pill`.

## Goal

Open the skill picker from a composer pill, with one tap and no keyboard. The mobile keyboard hides `/` behind a symbol layer, so reaching the native skill modal on a phone costs two taps before any typing starts.

## Two routes

**Route A, the one asked for.** A pill that types `/` into the composer and lets the host's own skill modal open. Blocked. See "Blocker".

**Route B, the fallback.** A pill whose popover renders its own skill list and sends the chosen skill directly. Buildable on 0.8.0 today. See "Route B".

Route A is preferred when it becomes possible. It reuses the host's picker, so the plugin carries no list UI, no filter box, and no argument input, and it stays correct when the host changes its picker.

## Blocker

Checked on 2026-09-11 against `@getpaseo/plugin@0.8.0`.

`client.addComposerPill` exists (`dist/client/contracts.d.ts:68`) and takes a `PluginButton` whose `behavior` can be `action`, `menu` or `popover` (`dist/client/buttons.d.ts`). None of those hands the plugin a composer handle.

The full client capability set is `PluginCommandCapabilities` (`dist/client/contracts.d.ts:127`): `paseo`, `rpc`, `openSurface`, `openSettings`, plus `openPanel` in the agent and workspace contexts. Nothing writes composer text, moves the caret, focuses the input, or opens a host modal.

A search for `composer` across `@getpaseo/plugin@0.8.0` and `@getpaseo/client@0.8.0` matches three files, all of them the pill registration type itself. There is no composer surface to call.

## How to recheck on a new release

Run these in `plugins/worktree-sync` after the SDK version there moves, or in a scratch directory that installs the new `@getpaseo/plugin`.

1. Find the installed SDK: `P=$(readlink -f node_modules/@getpaseo/plugin)`.
2. Search for a composer-write surface: `grep -rn "composer\|Composer\|insertText\|setText\|draft" $P/dist`.
3. Read the capability set: `grep -n "PluginCommandCapabilities" -A 20 $P/dist/client/contracts.d.ts`.
4. Read the button contract: `cat $P/dist/client/buttons.d.ts`.

Route A is unblocked when any one of these appears:

- A composer handle on `PluginCommandCapabilities` or on the pill's `onPress`, with a method that sets or appends composer text.
- A host-command API that opens the skill or slash-command picker by name.
- A `PluginButtonBehavior` variant that declares composer text as its effect.

A new `addComposerPill` field alone does not unblock it. The pill placement was never the missing part.

## Route A, when unblocked

One pill in the agent context, titled `/`. `onPress` appends `/` to the composer and focuses it. Nothing else. No settings, no server code, no timeline card. The plugin is one `index.client.tsx` and a manifest.

Open question for that day: does the host's picker open on a programmatic text change, or only on a real keystroke? If only on a keystroke, Route A stays blocked even with a composer-write API, and Route B is the answer for good.

## Route B, buildable today

Ship this if Route A stays blocked past the next release, or if the recheck shows the picker needs a real keystroke.

- Pill in the agent context with `behavior: { kind: "popover", Content }`.
- `Content` calls `paseo.agents.ref(agentId).commands()`. The payload is `{ agentId, commands: [{ name, description, argumentHint, kind }], error }`, where `kind` is `"command"` or `"skill"`. Filter to `kind === "skill"`.
- Render the list with a filter box. Use theme colours only and `layout.compact` for padding.
- On select, send `/<name>` with `paseo.agents.ref(agentId).send(text)`. Show an argument input first when `argumentHint` is non-empty.
- Handle the payload's own `error` string. A provider that cannot answer reports it there instead of rejecting.

Route B needs one spike before any code. Send `/<name>` to a live Claude agent with `send()` and check whether the provider runs it as a slash command or treats it as literal prompt text. Route B does not work if the provider takes it literally.

## Non-goals

- No change to Paseo core. Everything runs as a plugin.
- No re-implementation of the host picker's styling. Route B renders a plain list.
- No file, command or agent mentions. Skills only.

## Name candidates

| Name | Reads as |
| --- | --- |
| `skill-pill` | a pill that opens skills. Preferred. |
| `slash-pill` | a pill that stands in for the `/` key. Fits Route A, misleads under Route B. |
| `skill-picker` | a picker for skills. Plain, but hides that it is a pill. |
