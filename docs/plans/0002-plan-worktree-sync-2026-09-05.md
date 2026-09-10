# Plan: worktree-sync plugin

Grilled: 2026-09-05

## Context

Paseo registers no worktree on its own. Worktrees created outside Paseo (gitkit, `issuekit start`, or plain `git worktree add`) stay invisible in the sidebar until `/paseokit sync` runs by hand. The plugin closes that gap: it detects new worktrees of every project Paseo already knows and registers them automatically, with no dependency on gitkit, `~/worktrees`, or any specific orchestrator workflow. Success means a worktree appears in the Paseo sidebar within seconds of `git worktree add`, from any tool, with zero duplicate rows and zero auto-restored tombstones.

## Design decisions (settled)

| Decision | Resolution |
|----------|-----------|
| Repo discovery | Anchor on Paseo's project registry (`paseo project ls --json`), not a disk scan. A workspace row needs a `projectId` anyway; unknown repos stay out until the user adds the project. |
| Worktree discovery | `git -C <root> worktree list --porcelain` per project. Git is the authoritative registry regardless of where checkouts live. |
| Trigger | `fs.watch` on each project's `<gitdir>/worktrees/` directory (gains/loses a subdir on add/remove), debounced, plus a slow `setInterval` reconcile (~5 min) as the net for missed events and newly added projects. |
| Registration | Shell out to `paseo workspace create --isolation local --path <wt> --project <id> --title <branch> --json`, argv array. The `PluginContext` API has no workspace-create method. |
| Existence check | Read `~/.paseo/projects/workspaces.json` directly, both active and archived rows, keyed by absolute `cwd`. The CLI listing hides archived rows, and `workspace create` is not idempotent. |
| Tombstones | A path with an archived row is skipped. Restore is a manual action in the plugin panel, never automatic. |
| Direction | Sync-only. The plugin never archives, never deletes, never touches disk. `paseo workspace archive` deletes backing directories, so removal stays with `/paseokit clean`. |
| Titles | Branch name only. Issue-aware titles (`#42 · Fix login`) need `gh` and tracker logic; `/paseokit sync` keeps that job. |
| Registry read failure | Fail closed. On any `workspaces.json` read or parse error, register nothing that pass, log once, and let the next interval retry. No CLI fallback, since `paseo workspace ls` hides archived rows and would resurrect tombstones. |
| Daemon boot race | Retry the on-load reconcile with a short backoff (5 s, 15 s, 60 s), then hand over to the interval. |
| Timing values | Hardcoded constants in `index.ts`: 2 s debounce, 5 min interval. No config file for two numbers. |
| Reused tombstoned paths | Compare times. Register a worktree whose directory `birthtime` is newer than the row's `archivedAt`; fall back to always-suppress when the platform reports no birthtime. |
| Watch target | Watch the directory from `git -C <root> rev-parse --git-common-dir` itself, one watcher per project. It always exists, fires when `worktrees/` appears, and the debounce absorbs the extra noise. The plugin never creates directories inside `.git`. |
| Restore UI | Deferred. The phase 3 panel is read-only; the birthtime rule already handles the common path-reuse case, and manual restore stays with `/paseokit sync`. |

## Approach

Scaffold with `paseo plugin init worktree-sync --id worktree-sync` and follow the repo conventions: server logic in `index.ts` plus plain `.ts` files, React in `*.client.tsx`, RPC contracts in `contracts.ts` (reuse the `claude-usage` plugin's file layout and `defineRpc`/`plugin.handle` pattern). No bundler, `pnpm` only.

### Phase 1: reconcile core (built 2026-09-05)

The pure logic, no watchers yet.

- `paseo.ts`: read `~/.paseo/config.json` for the daemon paths, run `paseo project ls --json`, read `~/.paseo/projects/workspaces.json`, and wrap `paseo workspace create` behind an argv-array spawn helper.
- `worktrees.ts`: parse `git worktree list --porcelain` per project root. Exclude the main checkout, detached-HEAD entries, and paths under `~/.paseo/worktrees/` (Paseo-owned).
- `reconcile.ts`: join the two by absolute path into three buckets, `missing` (register), `tombstoned` (report only), `registered` (no-op). Register the `missing` bucket. Re-check existence immediately before each create to narrow the stale-read window.
- `pnpm typecheck` passes.

### Phase 2: plugin lifecycle (built 2026-09-05)

- `index.ts` `contribute()`: run the on-load reconcile with the 5 s / 15 s / 60 s backoff, start `fs.watch` on each project's git common dir with the shared 2 s debounce, start the 5-minute interval, and return a cleanup that closes every watcher and clears every timer, including a pending backoff.
- Refresh the watcher set on each interval pass so newly added Paseo projects get watched without a reload.
- Log each registration and each failed pass with `console.log`/`console.error`, which `paseo plugin logs worktree-sync` captures; the `PluginContext` declares no logger of its own.

### Phase 3: manual surface (built 2026-09-05)

- `contracts.ts`: `getSyncStatus` (last run, buckets per project) and `syncNow` RPCs.
- Command center item "Sync worktrees now" (`global` context) that calls `syncNow`.
- Small read-only status panel (`main.client.tsx`) listing registered rows, skipped tombstones, and the last-run time. No restore button in this phase. TanStack Query from the runtime for caching.

### Phase 4: docs and landing

- README per `docs/wiki/plugin-readme-template.md`.
- Row in the repo `README.md` table inside the `wikikit:front-door` markers, consistent with `docs/wiki/`; update `.wikimap.yaml` if a wiki page is added.
- Install with `paseo plugin install` from the local directory and verify with `paseo plugin logs`.

## Open questions

None. The 2026-09-05 grill settled all five draft questions; the resolutions live in the decisions table.

## Non-goals

- No archive, delete, or disk teardown. That stays with `/paseokit clean` and gitkit.
- No tracker integration: no `gh`, no issue titles, no issue closing.
- No machine-wide disk scan for repos Paseo does not know.
- No automatic project creation for unknown repos.
- No changes to the gitkit or issuekit skills.
