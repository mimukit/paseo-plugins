import type {
  PluginAgentCommandContext,
  PluginCleanup,
  PluginClientContext,
  PluginContext,
} from "@getpaseo/plugin";
import { KITS, PILL_KIT_IDS, kitPrompt } from "./kits";
import { makeKitPill } from "./pills.client";

// The scaffold's PaseoApi import resolves loosely against @getpaseo/client 0.4.0,
// so the agent surface is re-declared here and probed at runtime before use.
type AgentLike = { id?: string; workspaceId?: string | null; status?: string };
type PaseoAgents = {
  list(): Promise<{ entries?: unknown[] }>;
  ref(agentId: string): { send(text: string): Promise<void> };
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
      id: `kit-launcher.${kit.id}`,
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

    const pillCleanups = new Map<string, PluginCleanup[]>();

    const addPillsFor = (agent: AgentLike) => {
      const agentId = agent.id;
      const workspaceId = agent.workspaceId;
      if (!agentId || !workspaceId || pillCleanups.has(agentId)) return;
      if (agent.status === "closed") return;
      const cleanups = PILL_KIT_IDS.map((kitId) =>
        client.addComposerPill({
          id: `kit-launcher.pill.${kitId}.${agentId}`,
          title: kitId,
          workspaceId,
          agentId,
          Component: makeKitPill(`/${kitId}`),
          onPress: () => sendKit(client.paseo, agentId, kitId),
        }),
      );
      pillCleanups.set(agentId, cleanups);
    };

    const removePillsFor = (agentId: string) => {
      const cleanups = pillCleanups.get(agentId);
      if (!cleanups) return;
      pillCleanups.delete(agentId);
      for (const cleanup of cleanups) void cleanup();
    };

    agents
      .list()
      .then((result) => {
        for (const entry of result?.entries ?? []) {
          const agent = snapshotOf(entry);
          if (agent) addPillsFor(agent);
        }
      })
      .catch((error) => console.error("[kit-launcher] agent list failed", error));

    const unsubscribe = agents.subscribe((update) => {
      const agent = snapshotOf(update);
      if (!agent?.id) return;
      if (agent.status === "closed") removePillsFor(agent.id);
      else addPillsFor(agent);
    });

    return () => {
      unsubscribe();
      for (const agentId of [...pillCleanups.keys()]) removePillsFor(agentId);
    };
  });

  return () => {};
}
