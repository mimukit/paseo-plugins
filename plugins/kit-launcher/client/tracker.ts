import type { PluginCleanup } from "@getpaseo/plugin";
import type { PluginButtonRegistration, PluginClientContext } from "@getpaseo/plugin/client";
import { PILL_KIT_ID, kitPrompt } from "../shared/kits";
import { gitStatus } from "../shared/rpc";

type PaseoApi = PluginClientContext["paseo"];
type Handler<Api extends { subscribe(handler: never): unknown }> = Parameters<
  Parameters<Api["subscribe"]>[0]
>[0];

/**
 * Both streams are discriminated unions. `upsert` nests the snapshot; `remove`
 * carries an id and nothing else. Deriving the types here keeps the SDK package
 * out of this plugin's dependencies.
 */
type AgentUpdate = Handler<PaseoApi["agents"]>;
type AgentSnapshot = Extract<AgentUpdate, { kind: "upsert" }>["agent"];
type WorkspaceUpdate = Handler<PaseoApi["workspaces"]>;

/** One live agent and the directory whose working tree decides the pill. */
type TrackedAgent = { workspaceId: string; cwd: string; status: string | null };

// A directory is re-checked at most this often, however many events arrive.
const REFRESH_FLOOR_MS = 2_000;
// A commit made outside Paseo raises no event, so re-check on a slow timer too.
const BACKSTOP_MS = 15_000;

export function sendKit(client: PluginClientContext, agentId: string, kitId: string): void {
  client.paseo.agents
    .ref(agentId)
    .send(kitPrompt(kitId))
    .catch((error: unknown) => console.error("[kit-launcher] send failed", kitId, error));
}

/**
 * Track every live agent and show the commitkit pill on the ones whose working
 * tree is dirty. Returns the cleanup that releases all of it.
 */
export function startPillTracker(client: PluginClientContext): PluginCleanup {
  const { agents, workspaces } = client.paseo;

  // The pill exists per live agent whose working tree is dirty, so track the
  // agents and the directories separately: two agents can share one directory.
  const liveAgents = new Map<string, TrackedAgent>();
  const dirtyDirectories = new Set<string>();
  const pills = new Map<string, PluginButtonRegistration>();

  const inFlight = new Set<string>();
  const pendingAgain = new Set<string>();
  const lastRefreshAt = new Map<string, number>();
  const scheduled = new Map<string, ReturnType<typeof setTimeout>>();

  // The host drops this installation's pills before it awaits the cleanup
  // below. A pill added after that point outlives the installation and never
  // comes off the composer, so every add stops at this flag. A late callback
  // is the ordinary case here: a `git.status` answer arrives milliseconds
  // after a plugin reload starts.
  let stopped = false;

  const removePillFor = (agentId: string) => {
    const pill = pills.get(agentId);
    if (!pill) return;
    pills.delete(agentId);
    pill.remove();
  };

  const syncPillFor = (agentId: string) => {
    if (stopped) return;
    const agent = liveAgents.get(agentId);
    if (!agent || !dirtyDirectories.has(agent.cwd)) {
      removePillFor(agentId);
      return;
    }
    if (pills.has(agentId)) return;
    pills.set(
      agentId,
      client.addComposerPill({
        id: `kit-launcher-pill-${PILL_KIT_ID}-${agentId}`,
        workspaceId: agent.workspaceId,
        agentId,
        button: {
          title: PILL_KIT_ID,
          label: `/${PILL_KIT_ID}`,
          icon: "GitCommit",
          behavior: {
            kind: "action",
            onPress: () => sendKit(client, agentId, PILL_KIT_ID),
          },
        },
      }),
    );
  };

  const syncPillsIn = (cwd: string) => {
    for (const [agentId, agent] of liveAgents) {
      if (agent.cwd === cwd) syncPillFor(agentId);
    }
  };

  const requestRefresh = (cwd: string) => {
    if (stopped || scheduled.has(cwd)) return;
    const waited = Date.now() - (lastRefreshAt.get(cwd) ?? 0);
    if (waited >= REFRESH_FLOOR_MS) {
      runRefresh(cwd);
      return;
    }
    scheduled.set(
      cwd,
      setTimeout(() => {
        scheduled.delete(cwd);
        runRefresh(cwd);
      }, REFRESH_FLOOR_MS - waited),
    );
  };

  // The daemon runs `git status` for this directory. Only its answer moves a
  // pill, so a failed call leaves the last known state in place.
  function runRefresh(cwd: string): void {
    if (stopped) return;
    if (inFlight.has(cwd)) {
      pendingAgain.add(cwd);
      return;
    }
    inFlight.add(cwd);
    client
      .rpc(gitStatus, { cwd })
      .then((result) => {
        if (result.dirty) dirtyDirectories.add(cwd);
        else dirtyDirectories.delete(cwd);
        syncPillsIn(cwd);
      })
      .catch((error) => console.error("[kit-launcher] git status failed", cwd, error))
      .finally(() => {
        inFlight.delete(cwd);
        lastRefreshAt.set(cwd, Date.now());
        if (pendingAgain.delete(cwd)) requestRefresh(cwd);
      });
  }

  const forgetDirectory = (cwd: string) => {
    for (const agent of liveAgents.values()) {
      if (agent.cwd === cwd) return;
    }
    dirtyDirectories.delete(cwd);
    lastRefreshAt.delete(cwd);
    const timer = scheduled.get(cwd);
    if (timer) {
      clearTimeout(timer);
      scheduled.delete(cwd);
    }
  };

  /** Drop one agent and the pill it owns. The `remove` update lands here. */
  const dropAgent = (agentId: string) => {
    const dropped = liveAgents.get(agentId);
    liveAgents.delete(agentId);
    removePillFor(agentId);
    if (dropped) forgetDirectory(dropped.cwd);
  };

  const trackAgent = (agent: AgentSnapshot) => {
    if (stopped) return;
    const agentId = agent.id;
    if (!agentId) return;
    const cwd = typeof agent.cwd === "string" && agent.cwd.length > 0 ? agent.cwd : null;
    if (agent.status === "closed" || !agent.workspaceId || !cwd) {
      dropAgent(agentId);
      return;
    }
    const previous = liveAgents.get(agentId);
    const status = agent.status ?? null;
    liveAgents.set(agentId, { workspaceId: agent.workspaceId, cwd, status });
    // The old directory may have no other agent left; drop its cached state.
    if (previous && previous.cwd !== cwd) forgetDirectory(previous.cwd);
    syncPillFor(agentId);
    // A turn that ends is the likeliest moment for a new commit or a new edit.
    if (!previous || previous.cwd !== cwd || previous.status !== status) requestRefresh(cwd);
  };

  agents
    .list()
    .then((result) => {
      for (const entry of result?.entries ?? []) trackAgent(entry.agent);
    })
    .catch((error: unknown) => console.error("[kit-launcher] agent list failed", error));

  const unsubscribeAgents = agents.subscribe((update: AgentUpdate) => {
    if (update.kind === "remove") dropAgent(update.agentId);
    else trackAgent(update.agent);
  });

  // A workspace update carries the recomputed diff, so it marks the moment the
  // files under it changed. The directory answer still comes from `git status`.
  // A removed workspace takes its agents with it, so only `upsert` matters.
  const unsubscribeWorkspaces = workspaces.subscribe((update: WorkspaceUpdate) => {
    if (update.kind !== "upsert") return;
    const workspaceId = update.workspace.id;
    for (const agent of liveAgents.values()) {
      if (agent.workspaceId === workspaceId) requestRefresh(agent.cwd);
    }
  });

  const backstop = setInterval(() => {
    for (const agent of liveAgents.values()) requestRefresh(agent.cwd);
  }, BACKSTOP_MS);

  return () => {
    // The flag goes first. Everything after it can still fire a callback.
    stopped = true;
    clearInterval(backstop);
    for (const timer of scheduled.values()) clearTimeout(timer);
    scheduled.clear();
    unsubscribeAgents();
    unsubscribeWorkspaces();
    for (const agentId of [...pills.keys()]) removePillFor(agentId);
  };
}
