# Paseo plugin ideas

Eight plugin ideas drawn from how I already work: skill-driven Claude Code sessions, worktrees under `~/worktrees/`, a plan → grill → issue → implement → review → QA → PR chain, and hooks routed through `~/.local/bin/agent-hook`. The kit launcher and worktree-sync shipped and moved to `plugins/`.

Build order: the permission triage panel first, then the docs and issue attachment sources. All three are small and cut a real daily wait or real typing. The panels come after, once I know the panel API from the inside.

## Reference

Every plugin is a directory with `paseo-plugin.json` (only `id` is required) and an `index.ts` that default-exports `contribute(plugin: PluginContext)` and returns a cleanup function. UI lives in `*.client.tsx`, which Paseo keeps out of the daemon bundle. React, React Native, TanStack Query and Zod come from the runtime, so no bundler is needed for them.

Dev loop: edit, `pnpm typecheck`, `paseo plugin reload <id>`, `paseo plugin logs <id>`.

---

## 1. Permission triage panel

**What it does.** Lists every pending permission request across agents, with an allow button and a deny button per row. A blocked agent today waits silently in a background tab. This panel makes the wait visible, and it works well on the phone.

**Extension points.** `addWorkspacePanel` for the view, RPC handlers that call the daemon's `list_pending_permissions` and `respond_to_permission`.

**Where the code runs.** Server side talks to the daemon. The client renders the list and the two buttons.

**Detail worth getting right.** Poll or refresh often enough that a stale request does not get an answer after the agent moved on. Show the tool name and the exact command in the row, because an allow without the command is a blind approval.

**Effort.** Small.

**Value.** Removes the most common silent wait in a multi-agent session.

---

## 2. Status panel

**What it does.** Runs the read-only survey that statuskit does by hand, and renders it as a workspace panel. Working tree state, open PRs and their CI status, issues labelled `ready` with their priority, and plan files in `docs/plans/` that were never turned into issues. One crowned next move at the top, the rest below it.

**Extension points.** `addWorkspacePanel` for the view, one `handle(contract, handler)` for the data.

**Where the code runs.** Server side does the work: `git status`, `gh pr list`, `gh issue list`, a directory read of `docs/plans/`. The client renders. Define the contract with Zod so the panel and the handler stay in step.

**Detail worth getting right.** Cache the result and refresh on demand. Three `gh` calls on every panel mount will feel slow and will burn API quota. TanStack Query is in the runtime, so use it with a stale time of a minute or two.

**Effort.** Medium. The shell calls are easy; the ranking rule that picks the crowned move is the part that needs thought.

**Value.** Turns a skill I invoke deliberately into something I see on arrival.

---

## 3. Worktree panel

**What it does.** Lists the worktrees under `~/worktrees/` with branch name, base branch, ahead and behind counts, dirty or clean state, and linked PR state. Gives each row an archive button that runs the gitkit teardown for a merged branch.

**Extension points.** `addWorkspacePanel` or `addSidebarItem`, plus RPC handlers for list and archive.

**Where the code runs.** Server side. `git worktree list --porcelain`, then a `rev-list --left-right --count` per branch, then `gh pr view` per branch for the PR state.

**Detail worth getting right.** The archive action deletes a directory and a branch, so it must confirm first and must refuse when the worktree is dirty or the PR is unmerged. gitkit already defines those rules. The plugin should show the state and call the rules, not invent its own.

**Effort.** Medium. The read half is straightforward. The archive half needs care because it destroys work.

---

## 4. Docs attachment source

**What it does.** Makes project documents attachable by name in the composer instead of by path. Indexes `docs/plans/`, `docs/qa/`, `docs/adr/`, `docs/status/`, plus `DESIGN.md`, `CONTEXT.md` and `CLAUDE.md` at the repo root. Typing "auth plan" in the attachment picker finds `docs/plans/plan-auth-2026-08-14.md`.

**Extension points.** `addAttachmentSource`.

**Where the code runs.** Mostly server side for the directory scan and the search. The picker UI comes from Paseo.

**Detail worth getting right.** Search titles and filenames, not full text, at least at first. Plan files carry a date in the name, so sort newest first and show the date in the result row. Cap the result count so a repo with sixty QA files stays usable.

**Effort.** Small to medium, depending on how much of the picker Paseo supplies.

**Value.** Fits the plan → issue → implement chain directly. Every one of those steps starts by pointing an agent at a document.

---

## 5. Issue attachment source

**What it does.** Makes GitHub issues and PRs attachable by name in the composer. Searches `gh issue list` and `gh pr list` by title and number. Typing "auth" in the picker attaches issue #42 as a reference.

**Extension points.** `addAttachmentSource`.

**Where the code runs.** Server side runs the `gh` calls and builds the result payload. The picker UI comes from Paseo.

**Detail worth getting right.** Cache the list with TanStack Query so the picker does not fire a `gh` call per keystroke. Show the number, the state and the title in each row. Share the picker pattern with the docs attachment source; the two plugins should feel like one feature.

**Effort.** Small.

**Value.** Pairs with the docs source. issuekit, implementkit and mergekit all start from an issue or PR number.

---

## 6. QA runner panel

**What it does.** Renders the newest file in `docs/qa/` as a checklist. Each step becomes a checkbox. The tick state persists per workspace, so I can start a QA pass at the desk and finish it on the phone. Shows a count of steps not yet run.

**Extension points.** `addWorkspacePanel`, an RPC handler to read and parse the QA file, and a small store for the tick state.

**Where the code runs.** Server side reads and parses the Markdown. Client renders and toggles.

**Detail worth getting right.** qakit writes ordinary Markdown, not a fixed schema. The parser should take numbered lists and `- [ ]` items and ignore everything else, rather than demand a format qakit does not promise. Store the tick state keyed by file path and a content hash, so an edited QA file resets rather than showing stale ticks against changed steps.

**Effort.** Medium. The parser is the risk.

**Value.** Highest on mobile. A QA pass is the one part of my chain that needs a human and does not need a keyboard.

---

## 7. Verify proof gallery

**What it does.** Lists the verifykit screenshots and GIFs for the current branch in a panel, with a copy button that yields the Markdown for a PR body.

**Extension points.** `addWorkspacePanel`, one RPC handler to list the proof bundle.

**Where the code runs.** Server side reads the proof bundle directory. Client renders the thumbnails and the copy button.

**Detail worth getting right.** Depends on a stable proof bundle path per branch. Confirm what verifykit writes and where before starting. Render GIFs as a static first frame with a tap to play, or a panel with three GIFs will churn on mobile.

**Effort.** Small once the bundle path is confirmed.

**Value.** Closes the gap between "proof captured" and "proof in the PR body" without a file browser.

---

## 8. Hook log panel

**What it does.** Tails the `agent-hook` dispatcher output for the selected session and shows which hook fired, on which tool call, and what it decided. Makes a blocked `rm` or a denied edit legible instead of silent.

**Extension points.** `addWorkspacePanel` plus a streaming or polled RPC handler.

**Where the code runs.** Server side. Reads the dispatcher log and filters by session.

**Detail worth getting right.** The dispatcher serves Claude Code and Codex through one entry point, so the panel needs a session or agent identifier in each log line to filter correctly. If the log does not carry one today, that is a change to `private_dot_local/bin/executable_agent-hook`, not to the plugin. Check this before starting.

**Effort.** Small once the log format carries a session id. Blocked until then.

**Value.** Narrow but real. Hook behaviour is the least visible part of the setup, and the guard decisions are the ones I most want to see.

---

## Notes on all of them

Server code runs unsandboxed as the daemon user. Anything that shells out to `git` or `gh` gets full access to my machine, so keep the command construction free of interpolated user input.

Panels render on desktop, browser, iOS and Android. Use `theme.colors.foreground` and `theme.colors.foregroundMuted` rather than fixed colours, and respect `layout.compact`, or the panel breaks on a dark theme or a narrow screen.

Most of these read state that a skill already knows how to produce. That is the pattern worth following: the skill defines the rule, the plugin shows the result.
