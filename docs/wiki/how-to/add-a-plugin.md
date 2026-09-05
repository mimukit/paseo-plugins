# Add a plugin

Take a plugin from empty directory to something this repo ships.

## 1. Scaffold it

```sh
cd ~/Github/mimukit/paseo-plugins
paseo plugin init plugins/<name> --id <name>
```

Do not hand-write the scaffold. `paseo plugin init` writes `paseo-plugin.d.ts`, which carries the runtime type declarations, and those change with the Paseo version.

Every plugin lives under `plugins/`, never at the repo root. The directory name must equal the manifest `id`. `paseo plugin install --path <dir>` takes the directory, and `paseo plugin reload <id>` takes the id. Keeping them the same means one word for both.

## 2. Split client from server

Put every React component in a `*.client.tsx` file and import it from `index.ts`. Paseo keeps `*.client.tsx` out of the daemon bundle. Server code stays in `index.ts` and plain `.ts` files.

Do not add a bundler. React, React Native, TanStack Query and Zod come from the Paseo runtime.

## 3. Typecheck

```sh
cd plugins/<name>
pnpm install
pnpm typecheck
```

Run this before every reload and before you claim the work is done.

## 4. Install and iterate

```sh
paseo plugin install ~/Github/mimukit/paseo-plugins/plugins/<name>
pnpm typecheck && paseo plugin reload <name>
paseo plugin logs <name>
```

## 5. Write the plugin README

Copy [the template](../plugin-readme-template.md) into `<name>/README.md` and fill it in. It records what the plugin adds, the install command, and what it needs on the machine.

## 6. Register it

- Add a row to the plugin table in the repo [README](../../../README.md): name, one-line description, status.
- Cross the entry off [IDEAS.md](../../../IDEAS.md), or rewrite it with what you learned while building.

## 7. Commit

Commit the plugin directory, the README row, and the IDEAS.md change together. One plugin per commit keeps `git log` readable as a plugin list.

_Verified against `main`@`c4b0a58` on 2026-09-01._
