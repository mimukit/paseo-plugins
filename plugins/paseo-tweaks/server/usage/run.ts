import { execFile } from "node:child_process";
import { z } from "zod";
import type { UsageResult, UsageWindow } from "../../shared/usage/contract";

const TIMEOUT_MS = 10_000;

/**
 * The shape `usage --json` prints. Only these three fields are read.
 *
 * The CLI prints one of two sources. The statusline cache holds two windows with
 * `resets_at` in Unix seconds. The account cache in `~/.claude.json` holds every
 * window the account knows, most of them `null`, with `resets_at` as an ISO date
 * or `null`, next to entries that are not windows at all (`spend`, arrays). Each
 * entry is checked on its own, so one odd entry drops only itself.
 */
const RawUsageSchema = z.object({
  fetchedAtMs: z.number(),
  utilization: z.record(z.string(), z.unknown()),
});

const RawWindowSchema = z.object({
  utilization: z.number(),
  resets_at: z.union([z.string(), z.number()]),
});

const KNOWN_LABELS: Record<string, string> = {
  five_hour: "5 hour",
  seven_day: "7 day",
};

function labelFor(key: string): string {
  return KNOWN_LABELS[key] ?? key.replace(/_/g, " ");
}

/** Unix seconds as a number or a numeric string, or an ISO date. */
function resetsAtMs(value: string | number): number | null {
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const ms = Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
}

function toWindows(raw: z.output<typeof RawUsageSchema>): UsageWindow[] {
  const windows: UsageWindow[] = [];
  for (const [key, value] of Object.entries(raw.utilization)) {
    // A window the account does not have, or one with no reset, has nothing to show.
    const window = RawWindowSchema.safeParse(value);
    if (!window.success) continue;
    const resets = resetsAtMs(window.data.resets_at);
    if (resets === null) continue;
    windows.push({
      key,
      label: labelFor(key),
      utilization: window.data.utilization,
      resetsAtMs: resets,
    });
  }
  return windows;
}

type Spawned =
  | { status: "ok"; stdout: string }
  | { status: "not-found" }
  | { status: "timeout" }
  | { status: "failed"; detail: string };

/**
 * Arguments go in as an array, never a command string. The path comes from a
 * setting the machine's owner wrote, and the daemon is unsandboxed, so the array
 * form is what keeps a path with a space in it from becoming two arguments.
 */
function spawnUsage(binary: string, args: string[]): Promise<Spawned> {
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      { timeout: TIMEOUT_MS, maxBuffer: 1024 * 1024 },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ status: "ok", stdout });
          return;
        }
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") {
          resolve({ status: "not-found" });
          return;
        }
        // `execFile` reports a killed process for the timeout case.
        if ((error as { killed?: boolean }).killed) {
          resolve({ status: "timeout" });
          return;
        }
        const firstLine = stderr.split("\n").find((line) => line.trim().length > 0);
        resolve({ status: "failed", detail: firstLine?.trim() ?? error.message });
      },
    );
  });
}

/**
 * Run the usage CLI on this host and normalise its answer. Every failure comes
 * back as a value, never a throw, so the popover can name what broke instead of
 * rendering an empty body.
 */
export async function readUsageOnHost(input: {
  fetch: boolean;
  binaryPath: string;
}): Promise<UsageResult> {
  const binary = input.binaryPath.trim() || "usage";
  const args = input.fetch ? ["--json", "--fetch"] : ["--json"];
  const command = [binary, ...args].join(" ");

  const spawned = await spawnUsage(binary, args);
  if (spawned.status === "not-found") return { ok: false, reason: "not-found", detail: command };
  if (spawned.status === "timeout") return { ok: false, reason: "timeout", detail: command };
  if (spawned.status === "failed") {
    return { ok: false, reason: "failed", detail: spawned.detail };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(spawned.stdout);
  } catch {
    return { ok: false, reason: "unparseable", detail: "the CLI printed no JSON" };
  }

  const raw = RawUsageSchema.safeParse(parsed);
  if (!raw.success) {
    return { ok: false, reason: "unparseable", detail: raw.error.issues[0]?.message ?? "bad shape" };
  }

  return { ok: true, fetchedAtMs: raw.data.fetchedAtMs, windows: toWindows(raw.data) };
}
