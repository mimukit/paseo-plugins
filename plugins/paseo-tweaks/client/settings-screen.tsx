import type { PluginTheme } from "@getpaseo/plugin";
import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useSettings } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/react-native";
import { SettingsGroup, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { DEFAULT_SETTINGS, tweakSettings } from "../shared/settings";

const RELOAD_HINT = "Takes effect after `paseo plugin reload paseo-tweaks`.";

/**
 * A path needs the full row width to be readable, and `SettingsInput` puts the
 * control beside the label, which truncates a path at about 25 characters. This
 * field stacks the label, the hint and the input instead.
 *
 * It also saves on blur rather than on every keystroke. Each save returns a new
 * revision, so a per-keystroke save against one captured revision conflicts from
 * the second character on.
 */
function PathField({
  theme,
  label,
  hint,
  placeholder,
  value,
  error,
  disabled,
  onCommit,
}: {
  theme: PluginTheme;
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  error: string | null;
  disabled: boolean;
  onCommit(next: string): void;
}) {
  const [draft, setDraft] = useState(value);

  // A save elsewhere, or a reset, replaces the stored value under the field.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    const next = draft.trim();
    if (next === value) return;
    onCommit(next);
  };

  return (
    <View style={{ paddingVertical: 12, gap: 6 }}>
      <Text style={{ color: theme.colors.foreground, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 12, lineHeight: 17 }}>
        {hint}
      </Text>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.foregroundMuted}
        editable={!disabled}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        style={{
          marginTop: 2,
          width: "100%",
          color: theme.colors.foreground,
          backgroundColor: theme.colors.surface2,
          borderWidth: 1,
          borderColor: error ? theme.colors.statusDanger : theme.colors.border,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 13,
        }}
      />
      {error ? (
        <Text style={{ color: theme.colors.statusDanger, fontSize: 12 }}>{error}</Text>
      ) : null}
    </View>
  );
}

export function TweaksSettingsScreen({ theme }: PluginSurfaceProps) {
  const settings = useSettings(tweakSettings);

  if (settings.status === "loading") {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: theme.colors.foregroundMuted }}>Loading…</Text>
      </View>
    );
  }

  if (settings.status === "error" || settings.status === "invalid") {
    return (
      <View style={{ padding: 16 }}>
        <Text style={{ color: theme.colors.statusDanger }}>{settings.error}</Text>
      </View>
    );
  }

  const values = settings.values ?? DEFAULT_SETTINGS;
  const revision = settings.revision;

  return (
    <SettingsGroup title="Usage viewer">
      <SettingsSwitch
        label="Show the usage button"
        hint={RELOAD_HINT}
        value={values.usage.enabled}
        disabled={settings.saving}
        onValueChange={(enabled) => {
          void settings.save({ ...values, usage: { ...values.usage, enabled } }, revision);
        }}
      />
      <PathField
        theme={theme}
        label="Usage binary path"
        hint={`Leave empty to resolve \`usage\` on the daemon's PATH. ${RELOAD_HINT}`}
        placeholder="/home/dev/.local/bin/usage"
        value={values.usage.binaryPath}
        error={settings.saveError}
        disabled={settings.saving}
        onCommit={(binaryPath) => {
          void settings.save({ ...values, usage: { ...values.usage, binaryPath } }, revision);
        }}
      />
    </SettingsGroup>
  );
}
