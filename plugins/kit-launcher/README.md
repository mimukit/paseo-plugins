# kit-launcher

Puts every Claude Code kit one Command Center search or one composer tap away, and sends the matching `/kitname` prompt to the focused agent.

## What it adds

- Command center: one entry per kit — plankit, grillkit, issuekit, implementkit, reviewkit, qakit, prkit, statuskit, commitkit, debugkit (context: agent). Every entry answers the keyword `kit`.
- Composer pill: `/commitkit`, added per live agent whose working tree has uncommitted changes. The pill asks the daemon to run `git status --porcelain` in the agent's directory, so it disappears on commit. The `+11 -8` badge beside it counts the branch diff against the base ref and keeps counting after a commit; the two do not track each other.

## Install

```sh
paseo plugin install mimukit/paseo-plugins --path kit-launcher
```

## Requirements

- Paseo daemon running

## Configuration

None.

## Notes

Selecting an entry or tapping a pill sends the bare command at once. Paseo 0.7.0 has no composer-prefill API, so there is no fill-and-wait mode; each kit is interactive and asks for its own input, which keeps a mis-tap cheap. Kits that take an argument (`/implementkit #42`) are sent bare and resolve their input by their own precedence rules. The kit list is a hardcoded table in `kits.ts`; edit it and reload to change the set. The pill is fixed at `commitkit` (`PILL_KIT_ID` in `kits.ts`) and is not configurable.

The pill gate is the plugin's only server code. `git.server.ts` runs `git status --porcelain` through one RPC contract, `git.status` in `rpc.ts`, with the directory passed as an array argument. A directory is re-checked when an agent changes status, when its workspace reports a new diff, and every 15 seconds as a backstop, with a floor of one check per directory every 2 seconds. A non-git directory and a failed call both read as clean, so the pill stays hidden.

A plugin reload disposes the old client-side instance, and the host drops that instance's pills before it awaits the plugin's own cleanup. A pill added in that window belongs to a dead instance and stays on the composer until the app restarts. The client contribution therefore sets a `stopped` flag as the first line of its cleanup, and refuses every later add. Duplicate `/commitkit` pills, one per reload, are the symptom of missing that flag.

The same missing API rules out a pill that opens the built-in slash-command menu. A pill sends a prompt; it cannot put a `/` in the input box. Checked again against Paseo 0.7.2: the client contribution receives `paseo`, `rpc`, `openSurface`, `openPanel` and `addComposerPill`, and nothing that writes the composer.
