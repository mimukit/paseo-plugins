import type { PluginComposerPillProps } from "@getpaseo/plugin";
import React, { useMemo } from "react";
import { Text, View } from "react-native";

export function makeKitPill(label: string) {
  return function KitPill({ theme, layout }: PluginComposerPillProps) {
    const styles = useMemo(
      () => ({
        pill: {
          paddingHorizontal: layout.compact ? 8 : 10,
          paddingVertical: layout.compact ? 3 : 4,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        },
        label: {
          color: theme.colors.foreground,
          fontSize: layout.compact ? 12 : 13,
        },
      }),
      [theme, layout.compact],
    );
    return (
      <View style={styles.pill}>
        <Text style={styles.label}>{label}</Text>
      </View>
    );
  };
}
