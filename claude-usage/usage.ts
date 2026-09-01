import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { UsageWindow } from "./contracts";

const execFileAsync = promisify(execFile);

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";
const CACHE_TTL_MS = 60_000;

// Claude Code stores its OAuth credentials in the macOS Keychain under this
// service name, and in ~/.claude/.credentials.json on other platforms.
const KEYCHAIN_SERVICE = "Claude Code-credentials";

type CachedResult = {
  windows: UsageWindow[];
  fetchedAt: string | null;
  error: string | null;
};

let cache: { at: number; result: CachedResult } | null = null;

function parseAccessToken(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as {
      claudeAiOauth?: { accessToken?: string };
      accessToken?: string;
    };
    return parsed.claudeAiOauth?.accessToken ?? parsed.accessToken ?? null;
  } catch {
    return null;
  }
}

async function readAccessToken(): Promise<string | null> {
  if (process.platform === "darwin") {
    try {
      const { stdout } = await execFileAsync("security", [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-w",
      ]);
      const token = parseAccessToken(stdout.trim());
      if (token) return token;
    } catch {
      // Fall through to the credentials file.
    }
  }
  try {
    const raw = await readFile(join(homedir(), ".claude", ".credentials.json"), "utf8");
    return parseAccessToken(raw);
  } catch {
    return null;
  }
}

function windowLabel(key: string): string {
  if (key === "five_hour") return "Session";
  if (key === "seven_day") return "Weekly (all models)";
  if (key.startsWith("seven_day_")) {
    const model = key.slice("seven_day_".length).replace(/_/g, " ");
    return `Weekly (${model.charAt(0).toUpperCase()}${model.slice(1)})`;
  }
  return key.replace(/_/g, " ");
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function toWindow(key: string, value: unknown): UsageWindow | null {
  if (!value || typeof value !== "object") return null;
  const record = value as { utilization?: unknown; used_percentage?: unknown; resets_at?: unknown };
  const used = record.utilization ?? record.used_percentage;
  if (typeof used !== "number") return null;
  return {
    id: key,
    label: windowLabel(key),
    usedPercentage: clampPercent(used),
    resetsAt: typeof record.resets_at === "string" ? record.resets_at : null,
  };
}

// "five_hour" sorts first, then "seven_day", then the per-model weekly windows.
const WINDOW_ORDER = ["five_hour", "seven_day"];

function windowRank(id: string): number {
  const index = WINDOW_ORDER.indexOf(id);
  return index === -1 ? WINDOW_ORDER.length : index;
}

async function fetchUsage(): Promise<CachedResult> {
  const token = await readAccessToken();
  if (!token) {
    return {
      windows: [],
      fetchedAt: null,
      error: "No Claude Code credentials found. Sign in with `claude` in a terminal first.",
    };
  }
  const response = await fetch(USAGE_URL, {
    headers: {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
      "Content-Type": "application/json",
    },
  });
  if (!response.ok) {
    return {
      windows: [],
      fetchedAt: null,
      error: `Usage request failed with HTTP ${response.status}.`,
    };
  }
  const body = (await response.json()) as Record<string, unknown>;
  const windows: UsageWindow[] = [];
  for (const [key, value] of Object.entries(body)) {
    const window = toWindow(key, value);
    if (window) windows.push(window);
  }
  windows.sort((a, b) => windowRank(a.id) - windowRank(b.id) || a.id.localeCompare(b.id));
  if (windows.length === 0) {
    return { windows: [], fetchedAt: null, error: "The usage response held no known windows." };
  }
  return { windows, fetchedAt: new Date().toISOString(), error: null };
}

export async function getUsageCached(force: boolean): Promise<CachedResult> {
  const now = Date.now();
  if (!force && cache && now - cache.at < CACHE_TTL_MS) return cache.result;
  try {
    const result = await fetchUsage();
    cache = { at: now, result };
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { windows: [], fetchedAt: null, error: `Usage fetch failed: ${message}` };
  }
}
