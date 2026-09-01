# Getting started

Build a plugin in this repo and see it running in Paseo. Takes about ten minutes.

## Before you start

You need the Paseo CLI on your PATH and a running daemon:

```sh
paseo --version
```

This guide was written against Paseo 0.7.0.

## 1. Scaffold the plugin

Run the init command from the repo root. The directory name and the id must match, because every later command takes one or the other.

```sh
cd ~/Github/mimukit/paseo-plugins
paseo plugin init hello-kit --id hello-kit
```

You get six files:

```
hello-kit/
  paseo-plugin.json    # {"id": "hello-kit"}
  package.json         # devDependencies and a typecheck script
  tsconfig.json
  paseo-plugin.d.ts    # type declarations for the Paseo runtime
  index.ts             # default-exports contribute(plugin)
  main.client.tsx      # a surface that renders "Hello from my plugin"
```

## 2. Typecheck it

The scaffold declares its dev dependencies but does not install them. Install once, then typecheck:

```sh
cd hello-kit
npm install
npm run typecheck
```

`npm run typecheck` runs `tsc --noEmit`. Run it before every reload.

## 3. Install it into Paseo

Point the install command at the directory:

```sh
paseo plugin install ~/Github/mimukit/paseo-plugins/hello-kit
```

Confirm the daemon picked it up:

```sh
paseo plugin ls
```

## 4. See it in Paseo

The scaffold registers a surface with `plugin.addSurface("main", MainSurface)`. Open Paseo and look for the plugin's surface. It renders the text `Hello from my plugin`.

## 5. Change it and reload

Edit `main.client.tsx` and change the text. Then run the loop:

```sh
npm run typecheck
paseo plugin reload hello-kit
paseo plugin logs hello-kit
```

`logs` is where a failed load shows up. When a reload appears to do nothing, read the logs before anything else.

## What you built

A plugin that contributes one surface. The `contribute` function in `index.ts` is the whole entry point, and the cleanup function it returns is what Paseo calls on the next reload.

Next: read [Architecture](architecture.md) to see what else `contribute` can register, and [Add a plugin](how-to/add-a-plugin.md) for the steps that turn a scratch plugin into one this repo ships.

_Verified against `main`@`c4b0a58` on 2026-09-01._
