# paseo-plugins docs

Personal Paseo plugins. One directory per plugin, each installable on its own.

No plugin has landed yet. Everything here describes how to build and install one in this repo.

## Pages

- [Getting started](getting-started.md) — scaffold your first plugin, typecheck it, install it, watch it load.
- [Add a plugin](how-to/add-a-plugin.md) — the checklist from empty directory to a row in the README table.
- [Install a plugin](how-to/install-a-plugin.md) — install from Git or a local path, then reload, disable or remove it.
- [Architecture](architecture.md) — how a plugin is put together, and which half runs where.
- [Reference](reference.md) — the `PluginContext` extension points, the manifest, and the `paseo plugin` commands.
- [Plugin README template](plugin-readme-template.md) — the shape every plugin README follows.

Repo conventions for agent sessions live in [AGENTS.md](../../AGENTS.md). The plugin backlog lives in [IDEAS.md](../../IDEAS.md).

_Verified against `main`@`c4b0a58` on 2026-09-01._
