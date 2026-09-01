import type { PluginComposerPillProps } from "@getpaseo/plugin";
import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";

// The host Pressable already draws the pill shape: border, radius, surface1 fill
// and a surface2 hover fill. This component contributes the label only.
export function makeKitPill(label: string) {
  return function KitPill({ theme, layout }: PluginComposerPillProps) {
    const [hovered, setHovered] = useState(false);
    const style = useMemo(
      () => ({
        color: hovered ? theme.colors.foreground : theme.colors.foregroundMuted,
        fontSize: layout.compact ? 12 : 13,
      }),
      [theme, layout.compact, hovered],
    );
    return (
      <View
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
      >
        <Text style={style}>{label}</Text>
      </View>
    );
  };
}
