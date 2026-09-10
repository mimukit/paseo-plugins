
# Agents Guideline

This repo holds personal Paseo plugins. One directory per plugin, named after the plugin `id`, nested under `plugins/`.

## Convensions

- Read [docs/wiki/architecture.md](docs/wiki/architecture.md) and [docs/wiki/reference.md](docs/wiki/reference.md) before you write or change a plugin. They record the extension points and the rules.
- Put every plugin under `plugins/<id>/`. Never place a plugin directory at the repo root.
- Start a new plugin with `paseo plugin init plugins/<dir> --id <dir>`. Do not hand-write the scaffold.
- Split code by runtime directory. React components go in `client/`, daemon code in `server/`, and anything both import in `shared/`. The entries are `index.client.tsx` and `index.server.ts`. Paseo 0.8 rejects a code module left at the plugin root.
- Declare `"requirements": { "paseo": ">=0.8.0" }` in every `paseo-plugin.json`. A manifest without it reads as pre-0.8 and fails to load.
- Do not add a bundler. React, React Native, TanStack Query and Zod come from the Paseo runtime.
- Use `pnpm` for every package command. Never run `npm`, `npx` or `yarn`. Use `pnpm dlx` in place of `npx`.
- Run `pnpm typecheck` in the plugin directory before you claim the work is done.
- Server code is unsandboxed. Pass shell arguments as an array. Never interpolate user input into a command string.
- New plugin README follows [docs/wiki/plugin-readme-template.md](docs/wiki/plugin-readme-template.md).
- Add a row to the table in `README.md` when a plugin lands. Keep edits inside the `wikikit:front-door` markers consistent with `docs/wiki/`.
- Reader docs live in `docs/wiki/`, mapped by `docs/wiki/.wikimap.yaml`. Update the map when you add or remove a page.
- Never hard-wrap Markdown.
