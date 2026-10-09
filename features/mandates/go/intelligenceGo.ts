// features/mandates/go/intelligenceGo.ts — THE ALWAYS-VALID INTELLIGENCE ADDRESS.
//
// Build a link from an id alone — agent, agent version, workflow or workflow
// version — and the server resolves where it opens for this viewer.
//
// TWO doors, one resolver, because admin power never leaves the admin section
// (utils/auth/adminLaneServer.ts, Arman 2026-09-25):
//   - `/administration/intelligence/go/<id>` — from admin surfaces. A system
//     agent opens in the System Agents tree.
//   - `/intelligence/go/<id>` — from everywhere else. A system agent opens in
//     the ordinary agent view (read + Duplicate), like any member sees it.
// (`/agents/go/<id>` was one door for both; once the lane rule landed it could
// no longer tell an admin from a member and sent every system agent to the
// member view.)

import {
  agentPathFor,
  type AgentAddressViewer,
} from "@ai-matrx/chat/agents/addressing/agentAddress";
import type { IntelligenceTarget } from "./resolveIntelligenceId";

export type IntelligenceLane = "admin" | "user";

export function intelligenceGoHref(
  id: string,
  lane: IntelligenceLane = "user",
  sub = "",
): string {
  const base = lane === "admin" ? "/administration/intelligence/go" : "/intelligence/go";
  return `${base}/${encodeURIComponent(id)}${sub}`;
}

/** Where a resolved target opens, for the lane the request came through. */
export function intelligenceTargetPath(
  target: IntelligenceTarget,
  lane: IntelligenceLane,
  sub = "",
): string {
  if (target.kind === "agent") {
    const viewer: AgentAddressViewer = { isAdmin: lane === "admin" };
    return agentPathFor(target.address, sub, viewer);
  }
  // Workflows have one home for everyone; a version id lands on its workflow
  // (there is no per-version workflow page).
  return `/workflows/${target.definitionId}${sub}`;
}
