import type {
  PluginAgentCommandContext,
  PluginCleanup,
  PluginClientContext,
  PluginContext,
} from "@getpaseo/plugin";
import { KITS, PILL_KIT_ID, kitPrompt } from "./kits";
import { makeKitPill } from "./pills.client";

// The scaffold's PaseoApi import resolves loosely against @getpaseo/client 0.4.0,
// so the agent surface is re-declared here and probed at runtime before use.
type AgentLike = { id?: string; workspaceId?: string | null; status?: string };
type WorkspaceLike = {
  id?: string;
  diffStat?: { additions?: number; deletions?: number } | null;
};
type PaseoAgents = {
  list(): Promise<{ entries?: unknown[] }>;
  ref(agentId: string): { send(text: string): Promise<void> };
  subscribe(handler: (update: unknown) => void): () => void;
};
type PaseoWorkspaces = {
  list(): Promise<{ entries?: unknown[] }>;
  subscribe(handler: (update: unknown) => void): () => void;
};

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
  if (
    workspaces &&
    typeof workspaces.list === "function" &&
    typeof workspaces.subscribe === "function"
  ) {
    return workspaces as PaseoWorkspaces;
  }
  return null;
}

function workspaceOf(value: unknown): WorkspaceLike | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { workspace?: WorkspaceLike; id?: string };
  if (record.workspace && typeof record.workspace === "object") return record.workspace;
  if (typeof record.id === "string") return record as WorkspaceLike;
  return null;
}

// The composer indicator counts the same numbers, so the pill and the "+11 -8"
// badge appear and disappear together.
function hasUncommittedChanges(workspace: WorkspaceLike): boolean {
  const diffStat = workspace.diffStat;
  if (!diffStat) return false;
  return (diffStat.additions ?? 0) + (diffStat.deletions ?? 0) > 0;
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

export default function contribute(plugin: PluginContext) {
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
      console.warn("[kit-launcher] paseo.workspaces surface not found; pills disabled");
      return () => {};
    }

    // The pill exists per live agent whose workspace is dirty, so track both
    // sides and re-evaluate every agent of a workspace when its diff changes.
    const liveAgents = new Map<string, string>();
    const dirtyWorkspaces = new Set<string>();
    const pillCleanups = new Map<string, PluginCleanup>();

    const removePillFor = (agentId: string) => {
      const cleanup = pillCleanups.get(agentId);
      if (!cleanup) return;
      pillCleanups.delete(agentId);
      void cleanup();
    };

    const syncPillFor = (agentId: string) => {
      const workspaceId = liveAgents.get(agentId);
      const wanted = Boolean(workspaceId) && dirtyWorkspaces.has(workspaceId as string);
      if (!wanted) {
        removePillFor(agentId);
        return;
      }
      if (pillCleanups.has(agentId)) return;
      pillCleanups.set(
        agentId,
        client.addComposerPill({
          id: `kit-launcher-pill-${PILL_KIT_ID}-${agentId}`,
          title: PILL_KIT_ID,
          workspaceId: workspaceId as string,
          agentId,
          Component: makeKitPill(`/${PILL_KIT_ID}`),
          onPress: () => sendKit(client.paseo, agentId, PILL_KIT_ID),
        }),
      );
    };

    const trackAgent = (agent: AgentLike) => {
      const agentId = agent.id;
      if (!agentId) return;
      if (agent.status === "closed" || !agent.workspaceId) {
        liveAgents.delete(agentId);
        removePillFor(agentId);
        return;
      }
      liveAgents.set(agentId, agent.workspaceId);
      syncPillFor(agentId);
    };

    const trackWorkspace = (workspace: WorkspaceLike) => {
      const workspaceId = workspace.id;
      if (!workspaceId) return;
      if (hasUncommittedChanges(workspace)) dirtyWorkspaces.add(workspaceId);
      else dirtyWorkspaces.delete(workspaceId);
      for (const [agentId, agentWorkspaceId] of liveAgents) {
        if (agentWorkspaceId === workspaceId) syncPillFor(agentId);
      }
    };

    const forgetWorkspace = (workspaceId: string) => {
      dirtyWorkspaces.delete(workspaceId);
      for (const [agentId, agentWorkspaceId] of liveAgents) {
        if (agentWorkspaceId === workspaceId) syncPillFor(agentId);
      }
    };

    workspaces
      .list()
      .then((result) => {
        for (const entry of result?.entries ?? []) {
          const workspace = workspaceOf(entry);
          if (workspace) trackWorkspace(workspace);
        }
      })
      .catch((error) => console.error("[kit-launcher] workspace list failed", error));

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

    const unsubscribeWorkspaces = workspaces.subscribe((update) => {
      const record = update as { kind?: string; id?: string } | null;
      if (record?.kind === "remove" && typeof record.id === "string") {
        forgetWorkspace(record.id);
        return;
      }
      const workspace = workspaceOf(update);
      if (workspace) trackWorkspace(workspace);
    });

    return () => {
      unsubscribeAgents();
      unsubscribeWorkspaces();
      for (const agentId of [...pillCleanups.keys()]) removePillFor(agentId);
    };
  });

  return () => {};
}
