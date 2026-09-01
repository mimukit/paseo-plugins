# kit-launcher

Puts every Claude Code kit one Command Center search or one composer tap away, and sends the matching `/kitname` prompt to the focused agent.

## What it adds

- Command center: one entry per kit — plankit, grillkit, issuekit, implementkit, reviewkit, qakit, prkit, statuskit, commitkit, debugkit (context: agent). Every entry answers the keyword `kit`.
- Composer pill: `/commitkit`, added per live agent whose workspace has uncommitted changes. It reads the same `diffStat` numbers as the `+11 -8` badge beside it, so the two appear and disappear together.

## Install

```sh
paseo plugin install mimukit/paseo-plugins --path kit-launcher
```

## Requirements

- Paseo daemon running

## Configuration

None.

## Notes

Selecting an entry or tapping a pill sends the bare command at once. Paseo 0.7.0 has no composer-prefill API, so there is no fill-and-wait mode; each kit is interactive and asks for its own input, which keeps a mis-tap cheap. Kits that take an argument (`/implementkit #42`) are sent bare and resolve their input by their own precedence rules. The kit list is a hardcoded table in `kits.ts`; edit it and reload to change the set. The pill is fixed at `commitkit` (`PILL_KIT_ID` in `kits.ts`) and is not configurable. The plugin is client-only: no RPC contract, no server state, nothing shells out.
