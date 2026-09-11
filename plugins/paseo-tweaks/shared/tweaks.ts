/**
 * The tweak list. Ids and presentation only: each runtime imports its own
 * register function directly, so no client module is reachable from the server
 * bundle and no server module from the client one.
 */
export const TWEAKS = [
  {
    id: "usage",
    title: "Usage viewer",
    hint: "A header button that shows this host's Claude Code usage.",
  },
] as const;

export type TweakId = (typeof TWEAKS)[number]["id"];
