import type {
  PluginAgentCommandContext,
  PluginCleanup,
  PluginClientContext,
  PluginContext,
} from "@getpaseo/plugin";
import { isWorkingTreeDirty } from "./git.server";
import { KITS, PILL_KIT_ID, kitPrompt } from "./kits";
import { makeKitPill } from "./pills.client";
import { gitStatus } from "./rpc";

// The scaffold's PaseoApi import resolves loosely against @getpaseo/client 0.4.0,
// so the agent surface is re-declared here and probed at runtime before use.
type AgentLike = {
  id?: string;
  workspaceId?: string | null;
  status?: string;
  cwd?: string | null;
};
type PaseoAgents = {
  list(): Promise<{ entries?: unknown[] }>;
  ref(agentId: string): { send(text: string): Promise<void> };
  subscribe(handler: (update: unknown) => void): () => void;
};
type PaseoWorkspaces = {
  subscribe(handler: (update: unknown) => void): () => void;
};

// One live agent, with the two fields the pill needs: the workspace it belongs
// to and the directory whose working tree decides whether the pill shows.
type TrackedAgent = { workspaceId: string; cwd: string; status: string | null };

// A directory is re-checked at most this often, however many events arrive.
const REFRESH_FLOOR_MS = 2_000;
// A commit made outside Paseo raises no event, so re-check on a slow timer too.
const BACKSTOP_MS = 15_000;

function agentsApiOf(paseo: unknown): PaseoAgents | null {
  const agents = (paseo as { agents?: Partial<PaseoAgents> } | null)?.agents;
  if (
    agents &&
    typeof agents.list === "function" &&
    typeof agents.ref === "function" &&
    typeof agents.subscribe === "function"
  ) {
    return agents as PaseoAgents;
  }
  return null;
}

function workspacesApiOf(paseo: unknown): PaseoWorkspaces | null {
  const workspaces = (paseo as { workspaces?: Partial<PaseoWorkspaces> } | null)?.workspaces;
  if (workspaces && typeof workspaces.subscribe === "function") {
    return workspaces as PaseoWorkspaces;
  }
  return null;
}

function workspaceIdOf(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { workspace?: { id?: string }; id?: string };
  if (record.workspace && typeof record.workspace.id === "string") return record.workspace.id;
  if (typeof record.id === "string") return record.id;
  return null;
}

function snapshotOf(value: unknown): AgentLike | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { agent?: AgentLike; id?: string };
  if (record.agent && typeof record.agent === "object") return record.agent;
  if (typeof record.id === "string") return record as AgentLike;
  return null;
}

function sendKit(paseo: unknown, agentId: string, kitId: string): void {
  const agents = agentsApiOf(paseo);
  if (!agents) {
    console.error("[kit-launcher] paseo.agents is missing; cannot send", kitId);
    return;
  }
  agents
    .ref(agentId)
    .send(kitPrompt(kitId))
    .catch((error) => console.error("[kit-launcher] send failed", kitId, error));
}

// The daemon checks the requested directory against the live agents before it
// spawns git. Without this gate, any client code could probe any path on the
// machine and learn whether it is a dirty git repository.
async function isAgentCwd(paseo: unknown, cwd: string): Promise<boolean> {
  const agents = agentsApiOf(paseo);
  if (!agents) return false;
  const result = await agents.list();
  for (const entry of result?.entries ?? []) {
    const agent = snapshotOf(entry);
    if (agent && agent.status !== "closed" && agent.cwd === cwd) return true;
  }
  return false;
}

export default function contribute(plugin: PluginContext) {
  plugin.handle(gitStatus, async (input, context) => {
    if (!(await isAgentCwd(context.paseo, input.cwd))) return { dirty: false };
    return { dirty: await isWorkingTreeDirty(input.cwd) };
  });

  for (const kit of KITS) {
    plugin.addCommandCenterItem({
      id: `kit-launcher-${kit.id}`,
      title: kit.title,
      icon: kit.icon,
      keywords: kit.keywords,
      context: "agent",
      onSelect(context: PluginAgentCommandContext) {
        sendKit(context.paseo, context.agent.id, kit.id);
      },
    });
  }

  plugin.addClientSide((client: PluginClientContext) => {
    const agents = agentsApiOf(client.paseo);
    if (!agents) {
      console.warn("[kit-launcher] paseo.agents surface not found; pills disabled");
      return () => {};
    }

    console.log("[kit-launcher] paseo.agents found: list/ref/subscribe are callable");

    const workspaces = workspacesApiOf(client.paseo);
    if (!workspaces) {
      console.warn("[kit-launcher] paseo.workspaces surface not found; pill updates run on the timer only");
    }

    // The pill exists per live agent whose working tree is dirty, so track the
    // agents and the directories separately: two agents can share one directory.
    const liveAgents = new Map<string, TrackedAgent>();
    const dirtyDirectories = new Set<string>();
    const pillCleanups = new Map<string, PluginCleanup>();

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
      const cleanup = pillCleanups.get(agentId);
      if (!cleanup) return;
      pillCleanups.delete(agentId);
      void cleanup();
    };

    const syncPillFor = (agentId: string) => {
      if (stopped) return;
      const agent = liveAgents.get(agentId);
      if (!agent || !dirtyDirectories.has(agent.cwd)) {
        removePillFor(agentId);
        return;
      }
      if (pillCleanups.has(agentId)) return;
      pillCleanups.set(
        agentId,
        client.addComposerPill({
          id: `kit-launcher-pill-${PILL_KIT_ID}-${agentId}`,
          title: PILL_KIT_ID,
          workspaceId: agent.workspaceId,
          agentId,
          Component: makeKitPill(`/${PILL_KIT_ID}`),
          onPress: () => sendKit(client.paseo, agentId, PILL_KIT_ID),
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

    const trackAgent = (agent: AgentLike) => {
      if (stopped) return;
      const agentId = agent.id;
      if (!agentId) return;
      const cwd = typeof agent.cwd === "string" && agent.cwd.length > 0 ? agent.cwd : null;
      if (agent.status === "closed" || !agent.workspaceId || !cwd) {
        const dropped = liveAgents.get(agentId);
        liveAgents.delete(agentId);
        removePillFor(agentId);
        if (dropped) forgetDirectory(dropped.cwd);
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
        for (const entry of result?.entries ?? []) {
          const agent = snapshotOf(entry);
          if (agent) trackAgent(agent);
        }
      })
      .catch((error) => console.error("[kit-launcher] agent list failed", error));

    const unsubscribeAgents = agents.subscribe((update) => {
      const agent = snapshotOf(update);
      if (agent) trackAgent(agent);
    });

    // A workspace update carries the recomputed diff, so it marks the moment the
    // files under it changed. The directory answer still comes from `git status`.
    const unsubscribeWorkspaces = workspaces?.subscribe((update) => {
      const workspaceId = workspaceIdOf(update);
      if (!workspaceId) return;
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
      unsubscribeWorkspaces?.();
      for (const agentId of [...pillCleanups.keys()]) removePillFor(agentId);
    };
  });

  return () => {};
}
