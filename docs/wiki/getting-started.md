# Getting started

Build a plugin in this repo and see it running in Paseo. Takes about ten minutes.

## Before you start

You need the Paseo CLI on your PATH and a running daemon:

```sh
paseo --version
```

This guide was written against Paseo 0.8.0.

## 1. Scaffold the plugin

Run the init command from the repo root. The directory name and the id must match, because every later command takes one or the other.

```sh
cd ~/Github/mimukit/paseo-plugins
paseo plugin init plugins/hello-kit --id hello-kit
```

You get one entry per runtime and a directory for each:

```
plugins/hello-kit/
  paseo-plugin.json    # id and requirements.paseo
  package.json         # devDependencies and a typecheck script
  tsconfig.json
  index.client.tsx     # default-exports contribute(client)
  index.server.ts      # default-exports contribute(server)
  client/greeting.tsx  # a surface that renders a greeting
  server/greeting.ts   # the handler that produces it
  shared/greeting.ts   # the RPC contract both sides import
```

The directories are not a style choice. Paseo 0.8 rejects a code module left at the plugin root, and it fails the load when client code reaches a `node:` builtin.

## 2. Typecheck it

The scaffold declares its dev dependencies but does not install them. Install once, then typecheck:

```sh
cd plugins/hello-kit
pnpm install
pnpm typecheck
```

`pnpm typecheck` runs `tsc --noEmit`. Run it before every reload.

## 3. Install it into Paseo

Point the install command at the directory:

```sh
paseo plugin install ~/Github/mimukit/paseo-plugins/plugins/hello-kit
```

Confirm the daemon picked it up:

```sh
paseo plugin ls
```

## 4. See it in Paseo

The scaffold registers a surface with `client.addSurface("greeting", GreetingSurface)` and a sidebar entry pointing at it. Open Paseo and look for the plugin in the sidebar.

## 5. Change it and reload

Edit `client/greeting.tsx` and change the text. Then run the loop:

```sh
pnpm typecheck
paseo plugin reload hello-kit
paseo plugin logs hello-kit
```

`logs` is where a failed load shows up. When a reload appears to do nothing, read the logs before anything else.

## What you built

A plugin that contributes one surface and one RPC handler. Each `contribute` function is the entry point for its runtime, and the cleanup function it returns is what Paseo calls on the next reload.

Next: read [Architecture](architecture.md) to see what else `contribute` can register, and [Add a plugin](how-to/add-a-plugin.md) for the steps that turn a scratch plugin into one this repo ships.

_Verified against Paseo 0.8.0 on 2026-09-10._
