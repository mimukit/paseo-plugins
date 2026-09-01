import type { PluginHostProps, PluginTheme } from "@getpaseo/plugin";
import { Icon, useRpc } from "@getpaseo/plugin";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { getUsage, type UsageWindow } from "./contracts";

const REFRESH_INTERVAL_MS = 60_000;

type UsageState = {
  windows: UsageWindow[];
  fetchedAt: string | null;
  error: string | null;
  loading: boolean;
};

function formatResetIn(resetsAt: string | null, now: number): string | null {
  if (!resetsAt) return null;
  const target = Date.parse(resetsAt);
  if (Number.isNaN(target)) return null;
  const deltaMinutes = Math.max(0, Math.round((target - now) / 60_000));
  if (deltaMinutes < 1) return "Resets now";
  const days = Math.floor(deltaMinutes / 1440);
  const hours = Math.floor((deltaMinutes % 1440) / 60);
  const minutes = deltaMinutes % 60;
  if (days > 0) return `Resets in ${days}d ${hours}h`;
  if (hours > 0) return `Resets in ${hours}h ${minutes}m`;
  return `Resets in ${minutes}m`;
}

function formatUpdated(fetchedAt: string | null, now: number): string {
  if (!fetchedAt) return "Not updated yet";
  const deltaSeconds = Math.max(0, Math.round((now - Date.parse(fetchedAt)) / 1000));
  if (deltaSeconds < 15) return "Updated just now";
  if (deltaSeconds < 90) return "Updated 1m ago";
  return `Updated ${Math.round(deltaSeconds / 60)}m ago`;
}

function barColor(theme: PluginTheme, usedPercentage: number): string {
  if (usedPercentage >= 80) return theme.colors.statusDanger;
  if (usedPercentage >= 60) return theme.colors.statusWarning;
  return theme.colors.accent;
}

function UsageRow({ theme, window: item, now }: { theme: PluginTheme; window: UsageWindow; now: number }) {
  const left = Math.round(100 - item.usedPercentage);
  const reset = formatResetIn(item.resetsAt, now);
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ color: theme.colors.foreground, fontWeight: "600", marginBottom: 6 }}>
        {item.label}
      </Text>
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.colors.surface2,
          overflow: "hidden",
          marginBottom: 6,
        }}
      >
        <View
          style={{
            height: 6,
            borderRadius: 3,
            width: `${Math.max(item.usedPercentage, 1)}%`,
            backgroundColor: barColor(theme, item.usedPercentage),
          }}
        />
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>{left}% left</Text>
        {reset ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>{reset}</Text>
        ) : null}
      </View>
    </View>
  );
}

export function UsagePanel({ theme, layout }: PluginHostProps) {
  const rpc = useRpc(getUsage);
  const [state, setState] = useState<UsageState>({
    windows: [],
    fetchedAt: null,
    error: null,
    loading: true,
  });
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(
    async (force: boolean) => {
      setState((previous) => ({ ...previous, loading: true }));
      try {
        const result = await rpc({ force });
        setState({ ...result, loading: false });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setState((previous) => ({ ...previous, error: message, loading: false }));
      }
      setNow(Date.now());
    },
    [rpc],
  );

  useEffect(() => {
    void refresh(false);
    const poll = setInterval(() => void refresh(false), REFRESH_INTERVAL_MS);
    const clock = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [refresh]);

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
          marginBottom: 16,
        }}
      >
        <View>
          <Text style={{ color: theme.colors.foreground, fontSize: 18, fontWeight: "700" }}>
            Claude
          </Text>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 13 }}>
            {state.loading ? "Updating…" : formatUpdated(state.fetchedAt, now)}
          </Text>
        </View>
        <Pressable
          onPress={() => void refresh(true)}
          style={{ padding: 8 }}
          accessibilityLabel="Refresh usage"
        >
          <Icon name="RefreshCw" size={18} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>

      {state.error ? (
        <Text style={{ color: theme.colors.statusDanger, marginBottom: 16 }}>{state.error}</Text>
      ) : null}

      {state.windows.map((item) => (
        <UsageRow key={item.id} theme={theme} window={item} now={now} />
      ))}

      {!state.loading && !state.error && state.windows.length === 0 ? (
        <Text style={{ color: theme.colors.foregroundMuted }}>No usage data.</Text>
      ) : null}
    </ScrollView>
  );
}
