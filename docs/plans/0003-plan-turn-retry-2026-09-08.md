# Plan: turn-retry plugin

Drafted: 2026-09-08. Not grilled yet. Working name `turn-retry`; see "Name candidates" at the end.

## Context

When Claude Code or Codex hits a provider overload or a subscription window limit, the Paseo agent turn fails and the thread stops. The user has to notice, wait for the window to reset, and press send again. The bb editor ships a `provider-retry` plugin that watches failed turns and re-sends the same input after the reset, with a queued card the user can fire early or cancel. This plan clones that behaviour for Paseo.

## What the bb plugin does

Source: `https://github.com/get-bb/bb/tree/main/plugins/provider-retry`, read on 2026-09-08. Five files: `server.ts` (entry), `src/retry-policy.ts` (pure decision), `src/queued-retries.ts` (queue reads), `src/cli.ts` (`bb provider-retry status|retry|cancel`), one setting.

Workflow:

1. bb core emits `turn.failed` once per failed turn. The event carries `threadId`, `requestId`, `attemptNumber`, `errorInfo.category` (`overloaded`, `rate-limit`, other) and a `rateLimits` snapshot with `kind` (`subscription-window` or credit) and per-window `status` and `resetsAtMs`.
2. `decideRetry()` is pure. It declines when attempts reach 5 total, when the category is neither overload nor rate limit, when the provider reports no blocked window, when the limit is a credit or spend limit, or when the reset is farther away than the "maximum wait" setting (6 h default, 24 h, or no limit).
3. Overload: retry at `now + 5 s * 2^(attempt-1)` plus random jitter of the same size. Rate limit: retry at `max(resetsAt, now) + 15 s + random(0..30 s)`. The buffer avoids a second 429 at the exact reset; the jitter keeps many threads on one account from waking together.
4. The plugin calls `bb.sdk.threads.retry({ threadId, turnRequestId, sendAt, reason })`. Core owns the durable queue row, the re-send, and the "queued message" card with Send now and Cancel. A restart does not lose the row.
5. The CLI lists pending retries and maps `retry` and `cancel` onto the queued message send and delete calls.

Everything hard (error classification, rate limit windows, the attempt counter, the durable queue, the card) lives in bb core. The plugin is policy only.

## Can Paseo host a clone?

Yes on Paseo 0.8. No on Paseo 0.7.2, which is what this box runs today.

| bb capability | Paseo 0.7.2 (installed) | Paseo 0.8.0-beta.1 (npm tag `beta`, main branch) |
| --- | --- | --- |
| Server-side event on a failed turn | None. Server code gets `paseo` only inside an RPC handler. Only the client can subscribe to `agent_stream`, and the client is not always open. | `server.on("agent.turn_ended", (event, { paseo }))` with `outcome: { kind: "failed", error: { message, code? } }` and the full `timeline`. Runs on the daemon with no app connected. |
| Error category | Free text only. The Claude provider builds `turn_failed.error` from the message and `code` from a `code N` match. No provider classifies rate limits or overloads. | Same. The plugin must classify from text. |
| Rate limit windows with reset time | `provider.usage.list` exists on `DaemonClient` but not on `PaseoApi`. | `paseo.providers.listUsage()` returns per-provider `windows[]` with `usedPct`, `resetsAt`, `tone`. Fed by the quota fetcher, not by the failed turn. |
| Re-send the original input | `agents.ref(id).send(text)` exists. | Same. Attachments and images are not replayed; the reference states this. |
| Attempt counter per turn | None. | None. The plugin keeps its own. |
| Durable scheduled send | `schedule` API is cadence-based (`every`, `cron`) and creates a new agent or targets an existing one. No one-shot "send at T". | Same. The plugin keeps its own timer and a JSON file. |
| Queued card on the thread | None. | `paseo.agents.ref(id).timeline.append({ type: "plugin", id, kind, version, data })` plus `client.addTimelineRenderer`. Replaces the row on the same `id`. |
| Settings | None. | `defineSettings` in `shared/`, `server.registerSettings`, `useSettings` in the client, `client.addSettingsScreen`. |
| CLI subcommands | None for plugins. | None for plugins. Replace with a Command Center item and the card buttons. |

The 0.8 layout also changes: `index.server.ts`, `index.client.tsx`, and `client/`, `server/`, `shared/` directories. A plugin root with `index.ts` fails to load on 0.8. This repo's `AGENTS.md` and `docs/wiki/` describe the 0.7 layout. This plugin is the first one to need the new layout, so the wiki needs a 0.8 note when it lands.

The closest existing code is `plugin-examples/lifecycle-actions` in the Paseo repo. It watches `agent.turn_ended`, greps the latest output text for "out of credits", and sends "Try again." with no limit, no delay, and no persistence. This plan is that example with policy, persistence, and a card.

## Design decisions (proposed)

| Decision | Resolution |
| --- | --- |
| Target version | Paseo `>=0.8.0` in `paseo-plugin.json`. Install the `beta` CLI on this box with `mise` to scaffold and typecheck. Desktop verification waits for a 0.8 app build. |
| Trigger | `server.on("agent.turn_ended")`. Act on `outcome.kind === "failed"`. Also inspect a `completed` turn whose latest assistant text matches a usage-limit phrase, because Claude Code can end a turn with "You've hit your limit" as ordinary text. A spike confirms which shape each provider produces. |
| Classification | A pure `classify(message, latestText)` in `server/policy.ts` with two regex tables. Overload: `overloaded`, `529`, `503`, `500`, `ECONNRESET`, `fetch failed`, `socket hang up`. Rate limit: `429`, `rate limit`, `rate_limit`, `hit your limit`, `usage limit`, `resets`. Everything else declines with a named reason. Credit or billing words (`credit`, `billing`, `insufficient`) decline. |
| Reset time | First parse a time from the text when present. Otherwise call `paseo.providers.listUsage()` and take the latest `resetsAt` among the failed agent's provider windows with `usedPct >= 100` or `tone === "danger"`. No window means decline with `no-rate-limit-state`. |
| Delay policy | Port `retry-policy.ts` unchanged: 15 s buffer, 30 s jitter, overload base 5 s doubling with jitter, 5 total attempts, maximum wait 6 h default. Inject `now` and `random` for tests. |
| Retry input | The text of the latest `user_message` in `event.timeline`, verbatim. Store its `messageId` and a content hash. |
| Attempt counter | Keyed by `agentId` plus the user message hash. Stored with the pending retry. A retry that fails again re-enters with `attempt + 1`. |
| Persistence | One JSON file under the daemon home, `~/.paseo/plugins/turn-retry/pending.json`, written atomically. On `contribute`, read it and re-arm timers. A due entry fires at once. |
| Guard before send | Refresh the agent. Skip and clear when the agent is `running`, `closed`, or archived, or when a newer `user_message` exists after the failed one. The user pressing send themselves supersedes the retry. |
| Send | `paseo.agents.ref(agentId).send(text)` from the timer callback, never from inside the hook. The hook only records and arms. |
| Card | `timeline.append` with `kind: "turn-retry"`, `id: "turn-retry"` (one card per agent), data `{ sendAt, attempt, maxAttempts, reason }`. A client renderer shows the time and two buttons that call `sendNow` and `cancel` RPCs. On send or cancel, replace the card with a final state row. |
| Commands | Two Command Center items in `agent` context: "Retry now" and "Cancel pending retry". |
| Setting | `maximumWait` select: `6h`, `24h`, `none`. `defineSettings` with a Zod enum and default `6h`. A small settings screen. |
| Logging | `console.log` with a `[turn-retry]` prefix. `paseo plugin logs turn-retry` reads it. |

## Approach

### Phase 0: spike (throwaway)

Confirm the failure shapes before writing policy.

- Install the beta CLI: `mise use -g npm:@getpaseo/cli@0.8.0-beta.1` and confirm `paseo --version`.
- Install `plugin-examples/lifecycle-logger` from the Paseo checkout and read `paseo plugin logs lifecycle-logger` while a Claude agent hits a limit. Record the exact `outcome.error.message`, the `code`, and the latest assistant text.
- Call `paseo.providers.listUsage()` from a throwaway handler and record the window ids, `usedPct`, and `resetsAt` for Claude.
- Delete the spike. Paste the samples into `server/policy.test.ts` fixtures.

### Phase 1: policy core

- `server/policy.ts`: `classify`, `decideRetry`, `sendAtMs`, `overloadedSendAtMs`. Pure, no I/O.
- `server/usage.ts`: `latestBlockedResetAt(usage, providerId)`.
- `server/timeline.ts`: `latestUserMessage(timeline)`.
- Unit tests with vitest, run with `pnpm test`.

### Phase 2: scheduler and hook

- `server/store.ts`: read and write `pending.json`.
- `server/scheduler.ts`: arm, fire, cancel, sendNow. Guard before send. Re-enter on a second failure.
- `index.server.ts`: register the hook, the RPC handlers, the settings document, load the store, and return a cleanup that clears every timer and the hook registration.
- `pnpm typecheck` passes.

### Phase 3: card and commands

- `shared/contracts.ts`: `listPending`, `sendNow`, `cancel` RPCs and the card schema.
- `client/retry-card.tsx`: the timeline renderer. Theme colours only, `layout.compact` for padding.
- `client/settings.tsx` and the two Command Center items in `index.client.tsx`.

### Phase 4: docs and landing

- README per `docs/wiki/plugin-readme-template.md`, with a "Requires Paseo 0.8" line.
- Row in the repo `README.md` table.
- A short 0.8 layout note in `docs/wiki/architecture.md` and `docs/wiki/reference.md`, and update `AGENTS.md` so the `index.ts` rule reads "0.7 plugins".

## Open questions

- Does a Claude usage limit end the turn as `failed` or as `completed` with limit text? The spike answers this.
- Does the Claude quota fetcher run without a signed-in claude.ai session on a headless box? If not, the rate-limit path degrades to overload-style backoff with a short cap.
- Should a retry replay attachments? The SDK cannot. Decision: no, and say so on the card.
- Ship for Claude only first, or Claude and Codex? Codex has its own limit wording. Decision: Claude first, Codex table in phase 1 when the spike captures a sample.

## Non-goals

- No change to Paseo core. Everything runs as a plugin.
- No 0.7 support. The 0.7 daemon has no server-side turn event.
- No cron schedule. The schedule API creates agents on a cadence; it is the wrong tool for one send at one time.
- No credit or billing retries. Waiting does not fix those.

## Name candidates

Repo names so far are `kit-launcher` and `worktree-sync`: a noun, a hyphen, a verb or noun. Candidates:

| Name | Reads as | Note |
| --- | --- | --- |
| `turn-retry` | retry the turn | Preferred. Matches the Paseo term "turn" and the hook name. |
| `limit-retry` | retry after a limit | Narrower; hides the overload case. |
| `auto-resend` | resend on its own | Plain, but "resend" also fits a manual action. |
| `provider-retry` | same as bb | Exact clone name. Easy to find, less Paseo-specific. |
| `thread-keeper` | keeps the thread moving | Metaphor; the STE rule prefers the plain form. |
