import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginButtonContentProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { Icon } from "@getpaseo/plugin/client/react-native";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { readUsage, type UsageResult, type UsageWindow } from "../../shared/usage/contract";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** "in 45m", "in 4h 51m", "in 2d 8h". Past due reads "now". */
function formatReset(resetsAtMs: number, now: number): string {
  const left = resetsAtMs - now;
  if (left <= 0) return "now";
  if (left < HOUR_MS) return `in ${Math.round(left / MINUTE_MS)}m`;
  if (left < DAY_MS) {
    const hours = Math.floor(left / HOUR_MS);
    return `in ${hours}h ${Math.round((left - hours * HOUR_MS) / MINUTE_MS)}m`;
  }
  const days = Math.floor(left / DAY_MS);
  return `in ${days}d ${Math.round((left - days * DAY_MS) / HOUR_MS)}h`;
}

/** The CLI owns the cache, so the age of its answer is the only freshness signal. */
function formatAge(fetchedAtMs: number, now: number): string {
  const age = Math.max(0, now - fetchedAtMs);
  if (age < MINUTE_MS) return "read just now";
  if (age < HOUR_MS) return `read ${Math.round(age / MINUTE_MS)}m ago`;
  return `read ${Math.round(age / HOUR_MS)}h ago`;
}

function barColor(theme: PluginTheme, utilization: number): string {
  if (utilization >= 90) return theme.colors.statusDanger;
  if (utilization >= 70) return theme.colors.statusWarning;
  return theme.colors.accent;
}

function WindowRow({
  theme,
  window,
  now,
}: {
  theme: PluginTheme;
  window: UsageWindow;
  now: number;
}) {
  const percent = Math.max(0, Math.min(100, Math.round(window.utilization)));
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ color: theme.colors.foreground, fontSize: 13, fontWeight: "600" }}>
          {window.label}
        </Text>
        <Text style={{ color: theme.colors.foreground, fontSize: 13, fontVariant: ["tabular-nums"] }}>
          {percent}%
        </Text>
      </View>
      <View
        style={{
          height: 6,
          borderRadius: 3,
          backgroundColor: theme.colors.surface2,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${percent}%`,
            height: "100%",
            backgroundColor: barColor(theme, percent),
          }}
        />
      </View>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11, marginTop: 4 }}>
        resets {formatReset(window.resetsAtMs, now)}
      </Text>
    </View>
  );
}

function failureText(result: Extract<UsageResult, { ok: false }>): string {
  switch (result.reason) {
    case "not-found":
      return `No usage CLI here. Tried \`${result.detail}\`. Set the binary path in Settings → Paseo Tweaks.`;
    case "timeout":
      return `\`${result.detail}\` did not answer within 10 seconds.`;
    case "unparseable":
      return `The usage CLI answered in an unexpected shape: ${result.detail}`;
    default:
      return `The usage CLI failed: ${result.detail}`;
  }
}

/**
 * The popover body. One call on open, and one more per refresh press. The
 * binary path is fixed at registration, so a changed setting needs a plugin
 * reload, which the settings screen states.
 */
export function makeUsagePopover(binaryPath: string) {
  return function UsagePopover({ theme, host, layout }: PluginButtonContentProps) {
    const fetchUsage = useRpc(readUsage);
    const [result, setResult] = useState<UsageResult | null>(null);
    const [busy, setBusy] = useState(true);
    const [now, setNow] = useState(() => Date.now());

    // The RPC await outlives the popover every time it is dismissed early.
    const mounted = useRef(true);
    useEffect(() => {
      mounted.current = true;
      return () => {
        mounted.current = false;
      };
    }, []);

    const load = useCallback(
      async (probe: boolean) => {
        setBusy(true);
        try {
          const next = await fetchUsage({ fetch: probe, binaryPath });
          if (mounted.current) {
            setResult(next);
            setNow(Date.now());
          }
        } catch (error) {
          if (mounted.current) {
            setResult({ ok: false, reason: "failed", detail: String(error) });
          }
        } finally {
          if (mounted.current) setBusy(false);
        }
      },
      [fetchUsage],
    );

    useEffect(() => {
      void load(false);
    }, [load]);

    const padding = layout.compact ? 12 : 16;

    return (
      <View style={{ padding, minWidth: layout.compact ? 220 : 260, gap: 4 }}>
        <Text
          style={{
            color: theme.colors.foregroundMuted,
            fontSize: 11,
            fontWeight: "700",
            textTransform: "uppercase",
            marginBottom: 10,
          }}
        >
          Usage · {host.label}
        </Text>

        {result === null && busy ? <ActivityIndicator color={theme.colors.foregroundMuted} /> : null}

        {result?.ok === true
          ? result.windows.map((window) => (
              <WindowRow key={window.key} theme={theme} window={window} now={now} />
            ))
          : null}

        {result?.ok === true && result.windows.length === 0 ? (
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12 }}>
            The CLI reported no usage windows.
          </Text>
        ) : null}

        {result?.ok === false ? (
          <Text style={{ color: theme.colors.statusDanger, fontSize: 12, lineHeight: 17 }}>
            {failureText(result)}
          </Text>
        ) : null}

        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            borderTopWidth: 1,
            borderTopColor: theme.colors.border,
            marginTop: 6,
            paddingTop: 8,
          }}
        >
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>
            {result?.ok === true ? formatAge(result.fetchedAtMs, now) : ""}
          </Text>
          <Pressable
            onPress={() => void load(true)}
            disabled={busy}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, opacity: busy ? 0.5 : 1 }}
          >
            <Icon name="RefreshCw" size={12} color={theme.colors.foregroundMuted} />
            <Text style={{ color: theme.colors.foregroundMuted, fontSize: 11 }}>Refresh</Text>
          </Pressable>
        </View>
      </View>
    );
  };
}
