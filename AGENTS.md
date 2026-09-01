
# Agents Guideline

This repo holds personal Paseo plugins. One directory per plugin, named after the plugin `id`.

## Convensions

- Read [docs/wiki/architecture.md](docs/wiki/architecture.md) and [docs/wiki/reference.md](docs/wiki/reference.md) before you write or change a plugin. They record the extension points and the rules.
- Start a new plugin with `paseo plugin init <dir> --id <dir>`. Do not hand-write the scaffold.
- Keep React components in `*.client.tsx`. Server code goes in `index.ts` and plain `.ts` files.
- Do not add a bundler. React, React Native, TanStack Query and Zod come from the Paseo runtime.
- Run `npm run typecheck` in the plugin directory before you claim the work is done.
- Server code is unsandboxed. Pass shell arguments as an array. Never interpolate user input into a command string.
- New plugin README follows [docs/wiki/plugin-readme-template.md](docs/wiki/plugin-readme-template.md).
- Add a row to the table in `README.md` when a plugin lands. Keep edits inside the `wikikit:front-door` markers consistent with `docs/wiki/`.
- Reader docs live in `docs/wiki/`, mapped by `docs/wiki/.wikimap.yaml`. Update the map when you add or remove a page.
- Never hard-wrap Markdown.
