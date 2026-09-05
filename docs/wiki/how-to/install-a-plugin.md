# Install a plugin

Get a plugin from this repo into a running Paseo daemon, and manage it afterwards.

## Install from a local checkout

Use this while you are writing the plugin. The daemon reads the directory in place, so `paseo plugin reload` picks up your edits.

```sh
paseo plugin install ~/Github/mimukit/paseo-plugins/plugins/<plugin-dir>
```

## Install from this repo on GitHub

`install` takes an `owner/repo` shorthand or a Git URL. This repo holds many plugins, so `--path` selects one:

```sh
paseo plugin install mimukit/paseo-plugins --path plugins/<plugin-dir>
```

Pin to a branch, tag or commit with `--ref`:

```sh
paseo plugin install mimukit/paseo-plugins --path plugins/<plugin-dir> --ref v1.0.0
```

Override the runtime id with `--id` when it must differ from the manifest id. Leave it off in normal use.

## Confirm it loaded

```sh
paseo plugin ls
paseo plugin logs <id>
```

`logs` shows recent plugin output. A plugin that fails to load fails here, so read it before you debug anything else.

## Reload after a change

```sh
paseo plugin reload <id>
```

Reload calls the cleanup function your `contribute` returned, then loads the plugin again. A timer or watcher you did not release in cleanup survives the reload and runs twice.

## Update a Git-installed plugin

```sh
paseo plugin status          # check every plugin for source updates
paseo plugin update <id>
paseo plugin update --all
```

`status` and `update` apply to Git-managed plugins. A plugin installed from a local directory is not Git-managed here, so reload it instead.

## Turn one off or take it out

```sh
paseo plugin disable <id>
paseo plugin enable <id>
paseo plugin remove <id>
```

`disable` keeps the configuration and stops the plugin. `remove` deletes the plugin configuration.

## Target another machine

Every `paseo plugin` command takes `--host`. It accepts `host:port`, `tcp://host:port` or `ssh://user@host`. Without it the CLI uses the local socket, then falls back to `localhost:6767`.

```sh
paseo plugin ls --host ssh://mukit@devbox
```

Add `--json` to any of these commands for machine-readable output.

_Verified against `main`@`c4b0a58` on 2026-09-01._
