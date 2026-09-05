import type { PluginHostProps, PluginTheme } from "@getpaseo/plugin";
import { Icon, useRpc } from "@getpaseo/plugin";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { getSyncStatus, syncNow, type SyncStatus } from "./contracts";

const POLL_INTERVAL_MS = 30_000;

const EMPTY: SyncStatus = {
  registered: [],
  tombstoned: [],
  alreadyRegistered: [],
  errors: [],
  finishedAt: null,
  running: false,
};

function formatFinished(finishedAt: string | null, now: number): string {
  if (!finishedAt) return "No pass yet";
  const seconds = Math.max(0, Math.round((now - Date.parse(finishedAt)) / 1000));
  if (seconds < 15) return "Synced just now";
  if (seconds < 90) return "Synced 1m ago";
  return `Synced ${Math.round(seconds / 60)}m ago`;
}

function shortPath(path: string): string {
  const parts = path.split("/");
  return parts.slice(-2).join("/");
}

function Section({
  theme,
  title,
  rows,
  muted,
}: {
  theme: PluginTheme;
  title: string;
  rows: { path: string; branch: string; project: string }[];
  muted?: boolean;
}) {
  if (rows.length === 0) return null;
  return (
    <View style={{ marginBottom: 20 }}>
      <Text
        style={{
          color: theme.colors.foregroundMuted,
          fontSize: 12,
          fontWeight: "700",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {title} ({rows.length})
      </Text>
      {rows.map((row) => (
        <View key={row.path} style={{ marginBottom: 8 }}>
          <Text
            style={{
              color: muted ? theme.colors.foregroundMuted : theme.colors.foreground,
              fontSize: 14,
            }}
          >
            {row.branch}
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            {row.project} · {shortPath(row.path)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function SyncPanel({ theme, layout }: PluginHostProps) {
  const fetchStatus = useRpc(getSyncStatus);
  const runSync = useRpc(syncNow);
  const [status, setStatus] = useState<SyncStatus>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchStatus({}));
    } catch {
      // The daemon answers on the next poll. A transient RPC failure is not
      // worth replacing the last good status with an error.
    }
    setNow(Date.now());
  }, [fetchStatus]);

  const sync = useCallback(async () => {
    setBusy(true);
    try {
      setStatus(await runSync({}));
    } catch {
      // Same as above; the pass logs its own failures.
    }
    setBusy(false);
    setNow(Date.now());
  }, [runSync]);

  useEffect(() => {
    void refresh();
    const poll = setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(poll);
  }, [refresh]);

  const running = busy || status.running;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.surface0 }}
      contentContainerStyle={{ padding: layout.compact ? 16 : 24 }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <View>
          <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "700" }}>
            Worktree sync
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
            {running ? "Syncing…" : formatFinished(status.finishedAt, now)}
          </Text>
        </View>
        <Pressable
          onPress={() => void sync()}
          disabled={running}
          style={{ padding: 8, opacity: running ? 0.5 : 1 }}
          accessibilityLabel="Sync worktrees now"
        >
          <Icon name="RefreshCw" size={18} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>

      <Section theme={theme} title="Registered this pass" rows={status.registered} />
      <Section theme={theme} title="Tracked" rows={status.alreadyRegistered} muted />
      <Section theme={theme} title="Skipped, archived before" rows={status.tombstoned} muted />

      {status.errors.length > 0 ? (
        <View style={{ marginBottom: 20 }}>
          <Text
            style={{
              color: theme.colors.statusDanger,
              fontSize: 12,
              fontWeight: "700",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Errors ({status.errors.length})
          </Text>
          {status.errors.map((error) => (
            <Text
              key={error}
              style={{ color: theme.colors.foregroundMuted, fontSize: 12, marginBottom: 4 }}
            >
              {error}
            </Text>
          ))}
        </View>
      ) : null}

      {status.finishedAt !== null &&
      status.registered.length === 0 &&
      status.alreadyRegistered.length === 0 &&
      status.tombstoned.length === 0 ? (
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
          No worktrees found in any Paseo project.
        </Text>
      ) : null}
    </ScrollView>
  );
}
