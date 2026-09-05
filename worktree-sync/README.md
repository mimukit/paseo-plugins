# worktree-sync

Registers every git worktree of every Paseo project as a workspace, so worktrees created outside Paseo show up in the sidebar on their own.

## What it adds

- Command center: `Worktree Sync — sync worktrees now` (context: global)
- Sidebar item: `Worktree Sync`
- Surface: a read-only status panel listing what the last pass registered, tracked, and skipped

## Install

```sh
paseo plugin install mimukit/paseo-plugins --path worktree-sync
```

## Requirements

- Paseo daemon running
- `git` and the `paseo` CLI on PATH

## Configuration

None. The debounce (2 s) and the reconcile interval (5 min) are constants in `service.ts`.

## How it works

The plugin takes Paseo's own project list as its anchor, then asks git for the worktrees of each project root. Git records every worktree of a repo wherever it lives on disk, so this works for any tool that ran `git worktree add`: gitkit, `issuekit start`, or your own hands. No directory convention is assumed and no disk scan runs.

A pass runs on plugin load, every five minutes, and within two seconds of a change under a project's `.git/worktrees`. Each pass joins the git list against `~/.paseo/projects/workspaces.json` and registers only paths that have no row.

## Notes

- **Sync only.** The plugin never archives a row and never deletes from disk. `paseo workspace archive` deletes the backing worktree directory, so teardown stays a human decision. The paseokit skill owns that half.
- **Archived paths stay archived.** A path with an archived row is skipped, unless the directory now on that path was created after the row was archived. That one case is a reused path holding new work, so it registers.
- **Failed registry reads register nothing.** `workspaces.json` is Paseo's internal file, not a declared API. If it cannot be read or parsed, the pass logs the failure and stops, because registering without it produces duplicate rows that nothing here can undo.
- **Titles are branch names.** Issue-aware titles need a tracker lookup, which this plugin does not do. `paseokit sync` renames rows.
- **Unknown repos stay out.** A worktree registers only when Paseo already knows its project, because a workspace row needs a project id.
