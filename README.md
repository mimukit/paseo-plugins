<!-- wikikit:front-door:start -->
# paseo-plugins

My personal [Paseo](https://getpaseo.com) plugins. One directory per plugin, each installable on its own.

Paseo is the client I drive Claude Code from. These plugins bend it toward my workflow: skill-driven sessions, worktrees under `~/worktrees/`, and a plan → grill → issue → implement → review → QA → PR chain.

## Plugins

| Plugin | What it does | Status |
| --- | --- | --- |
| _(none yet)_ | | |

Add a row when a plugin lands. Keep the description to one line.

## Quickstart

Install one plugin straight from this repo:

```sh
paseo plugin install mimukit/paseo-plugins --path <plugin-dir>
paseo plugin ls
```

Install from a local checkout instead, which is what I do while writing one:

```sh
paseo plugin install ~/Github/mimukit/paseo-plugins/<plugin-dir>
pnpm typecheck && paseo plugin reload <id>
paseo plugin logs <id>
```

## Docs

- [Getting started](docs/wiki/getting-started.md) — scaffold your first plugin and watch it load
- [Add a plugin](docs/wiki/how-to/add-a-plugin.md) — the checklist this repo follows
- [Install a plugin](docs/wiki/how-to/install-a-plugin.md) — install, reload, update, remove
- [Architecture](docs/wiki/architecture.md) — the client/server split and typed RPC
- [Reference](docs/wiki/reference.md) — extension points, manifest, CLI commands

The full set is in [docs/wiki/](docs/wiki/index.md). [IDEAS.md](IDEAS.md) holds the backlog.
<!-- wikikit:front-door:end -->

## License

MIT. See [LICENSE](LICENSE).
