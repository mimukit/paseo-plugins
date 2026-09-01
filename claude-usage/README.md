# claude-usage

Shows the Claude Code rate-limit usage (session, weekly, per-model) as progress bars, like the Claude desktop usage popover.

## What it adds

- Sidebar item: `Claude Usage` (opens the usage surface)
- Workspace panel: `Claude Usage`
- Command center: `Claude Usage — show rate limits` (context: global)

## Install

```sh
paseo plugin install mimukit/paseo-plugins --path claude-usage
```

## Requirements

- Paseo daemon running
- A Claude Code sign-in on the daemon machine. The plugin reads the OAuth token from the macOS Keychain entry `Claude Code-credentials`, or from `~/.claude/.credentials.json` on other platforms.

## Configuration

None.

## Notes

The daemon calls `https://api.anthropic.com/api/oauth/usage` with the Claude Code OAuth token and caches the result for 60 seconds. The panel polls every minute and has a manual refresh button. Each usage window from the API renders as one row with a bar, the percent left, and the reset countdown. Unknown window keys still render, with a prettified label, so new API windows appear without a code change. The plugin never writes credentials and never refreshes the OAuth token; when the token is expired the panel shows the HTTP error and a new `claude` sign-in fixes it.

_Verified against `main`@`d98e8d0` on 2026-09-02._
