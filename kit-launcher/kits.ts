export type Kit = {
  id: string;
  title: string;
  icon: string;
  keywords: readonly string[];
};

export const KITS: readonly Kit[] = [
  { id: "plankit", title: "plankit — plan a feature", icon: "map", keywords: ["kit", "plan", "prd", "spec", "brainstorm"] },
  { id: "grillkit", title: "grillkit — grill a plan", icon: "flame", keywords: ["kit", "grill", "interrogate", "pressure-test", "harden"] },
  { id: "issuekit", title: "issuekit — file or work issues", icon: "circle-dot", keywords: ["kit", "issue", "tracker", "backlog", "github"] },
  { id: "implementkit", title: "implementkit — build from a plan", icon: "hammer", keywords: ["kit", "implement", "build", "code", "tdd"] },
  { id: "reviewkit", title: "reviewkit — review the changes", icon: "eye", keywords: ["kit", "review", "diff", "slop", "check"] },
  { id: "qakit", title: "qakit — write a QA plan", icon: "clipboard-check", keywords: ["kit", "qa", "test plan", "manual test"] },
  { id: "prkit", title: "prkit — open a pull request", icon: "git-pull-request", keywords: ["kit", "pr", "pull request", "submit"] },
  { id: "statuskit", title: "statuskit — what should I do next", icon: "gauge", keywords: ["kit", "status", "next move", "dashboard"] },
  { id: "commitkit", title: "commitkit — commit and push", icon: "git-commit", keywords: ["kit", "commit", "push", "conventional"] },
  { id: "debugkit", title: "debugkit — find the root cause", icon: "bug", keywords: ["kit", "debug", "root cause", "flaky", "bisect"] },
];

export const PILL_KIT_IDS: readonly string[] = ["plankit", "implementkit", "commitkit"];

export function kitPrompt(kitId: string): string {
  return `/${kitId}`;
}
