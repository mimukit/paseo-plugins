export type Kit = {
  id: string;
  title: string;
  icon: string;
  keywords: readonly string[];
};

export const KITS: readonly Kit[] = [
  { id: "plankit", title: "plankit — plan a feature", icon: "Map", keywords: ["kit", "plan", "prd", "spec", "brainstorm"] },
  { id: "grillkit", title: "grillkit — grill a plan", icon: "Flame", keywords: ["kit", "grill", "interrogate", "pressure-test", "harden"] },
  { id: "issuekit", title: "issuekit — file or work issues", icon: "CircleDot", keywords: ["kit", "issue", "tracker", "backlog", "github"] },
  { id: "implementkit", title: "implementkit — build from a plan", icon: "Hammer", keywords: ["kit", "implement", "build", "code", "tdd"] },
  { id: "reviewkit", title: "reviewkit — review the changes", icon: "Eye", keywords: ["kit", "review", "diff", "slop", "check"] },
  { id: "qakit", title: "qakit — write a QA plan", icon: "ClipboardCheck", keywords: ["kit", "qa", "test plan", "manual test"] },
  { id: "prkit", title: "prkit — open a pull request", icon: "GitPullRequest", keywords: ["kit", "pr", "pull request", "submit"] },
  { id: "statuskit", title: "statuskit — what should I do next", icon: "Gauge", keywords: ["kit", "status", "next move", "dashboard"] },
  { id: "commitkit", title: "commitkit — commit and push", icon: "GitCommit", keywords: ["kit", "commit", "push", "conventional"] },
  { id: "debugkit", title: "debugkit — find the root cause", icon: "Bug", keywords: ["kit", "debug", "root cause", "flaky", "bisect"] },
];

// The single pill. It appears only while its workspace has uncommitted changes.
export const PILL_KIT_ID = "commitkit";

export function kitPrompt(kitId: string): string {
  return `/${kitId}`;
}
