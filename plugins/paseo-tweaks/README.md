# paseo-tweaks

A collection of small UI tweaks for Paseo, each too small to be its own plugin.

## What it adds

- Workspace header button: `Usage` (icon-only, opens a popover)
- Settings screen: `Paseo Tweaks`
- Command center: `Paseo Tweaks — settings` (context: global)

## Tweaks

| Tweak | What it does | Default |
| --- | --- | --- |
| `usage` | A header button whose popover shows this host's Claude Code usage windows, read from the `usage` CLI on demand | On |

## Install

```sh
paseo plugin install mimukit/paseo-plugins --path plugins/paseo-tweaks
```

Install it on every host you want the tweaks on. A plugin is configured per daemon, so each machine runs its own copy against its own Claude Code account.

## Requirements

- Paseo daemon running, version 0.8.0 or later
- The `usage` CLI on the daemon's PATH, or its absolute path set in the settings screen

## Configuration

The settings screen `Paseo Tweaks` holds one section per tweak. For `usage`:

| Setting | Default | Notes |
| --- | --- | --- |
| Show the usage button | on | Turns the tweak off without removing the plugin |
| `usage` binary path | empty | Empty resolves `usage` on the daemon's PATH |

Settings are host-scoped, so each machine keeps its own values. Both settings are read once when the plugin loads, so a change takes effect after `paseo plugin reload paseo-tweaks`.

## Notes

- The popover runs `usage --json` when you open it, and `usage --fetch --json` when you press refresh. The CLI owns its own cache, default 120 seconds, and this plugin adds no second cache.
- A header button needs a workspace, so the viewer is unreachable on the home screen.
- The window list is open-ended. A usage window this plugin has never seen still renders, labelled from its key.
- The daemon cannot read its own settings document in Paseo 0.8.0, so the client passes the binary path with each call.
- On the Plugins page, Paseo 0.8.0 renders a plugin's settings-screen row under the plugin's action buttons as a full-width row, which reads as a break between two plugin cards. The host owns that placement; a plugin supplies only the screen id, title and icon. Use the command center entry to skip the Plugins page.

_Verified against `main`@`dc66db5` on 2026-09-11._
