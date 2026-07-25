// lib/coming-soon/registry.ts
//
// THE registry of every "Coming Soon" the product shows a user.
//
// Policy (CLAUDE.md § Coming Soon is a promise, not a placeholder):
// we deliberately advertise actions we intend to build, so users see where
// the product is going and engineers feel the debt. That only works if every
// promise is DECLARED HERE — one row, with a named stage and a real blocker —
// so it can be counted and reviewed like a found defect.
//
// Never render a bare "coming soon" string. Register it, then call
// `announceComingSoon(id)`.

import type { ComingSoonEntry } from "./types";

export const COMING_SOON: Record<string, ComingSoonEntry> = {
  "agents.create-app": {
    id: "agents.create-app",
    label: "Create App from Agent",
    owner: "agents",
    promise:
      "Turn this agent into a standalone no-code app with its own URL, inputs, and shareable runs.",
    stage: "planned",
    surfaces: ["/agents/all card actions", "/agents/browse row menu"],
  },
  "agents.save-as-template": {
    id: "agents.save-as-template",
    label: "Save as Template",
    owner: "agents",
    promise:
      "Publish this agent as a reusable template others can start new agents from.",
    stage: "blocked",
    blockedBy:
      "POST /api/agents/[id]/convert-to-template exists for agents, but the admin row action only toasts — the template surface that consumes the result is not built.",
    surfaces: ["/agents/all card actions", "/agents/browse row menu"],
  },
  "agents.make-global-builtin": {
    id: "agents.make-global-builtin",
    label: "Make Global Built-in",
    owner: "agents",
    promise:
      "Promote this agent to a platform built-in available to every user without sharing.",
    stage: "planned",
    surfaces: ["/agents/browse row menu (super-admin)"],
  },
  "agents.export": {
    id: "agents.export",
    label: "Export Agent",
    owner: "agents",
    promise:
      "Download this agent's full definition as portable JSON to move it between environments.",
    stage: "planned",
    surfaces: ["/agents/browse row menu"],
  },
  "agents.move-to-org": {
    id: "agents.move-to-org",
    label: "Move to Organization",
    owner: "agents",
    promise:
      "Reassign this agent's owning organization so it appears under a different team's My Orgs.",
    stage: "planned",
    surfaces: ["/agents/browse row menu"],
  },
  "agents.compare-versions": {
    id: "agents.compare-versions",
    label: "Compare Versions",
    owner: "agents",
    promise:
      "Diff two versions of this agent side by side — prompt, tools, model, and settings.",
    stage: "planned",
    surfaces: ["/agents/browse row menu"],
  },
};

export function getComingSoon(id: string): ComingSoonEntry | undefined {
  return COMING_SOON[id];
}

export function listComingSoon(owner?: string): ComingSoonEntry[] {
  const all = Object.values(COMING_SOON);
  return owner ? all.filter((e) => e.owner === owner) : all;
}
