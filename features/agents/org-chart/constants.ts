// features/agents/org-chart/constants.ts
//
// THE LINK TYPES of the agent org chart (Arman, 2026-10-04: "a setting that
// allows us to define the type of edge"). Every link on the chart is exactly
// one of these, and a new type is one new entry here — the chart, the legend,
// the menus and the storage all read this registry.
//
//   • directs       — an Orchestra: the Conductor directs its members when it
//                     runs and the work comes back to it. ENFORCED by the
//                     runtime; derived live from the Orchestra's member edges,
//                     never maintained here.
//   • reports_to    — recorded structure ("this sits under that"). Not enforced.
//   • hands_off_to  — work passes on and does NOT come back (a process step,
//                     an out-of-lane task given to the expert). Not enforced.
//   • dotted_line   — advises / is consulted, with no authority. Not enforced.
//
// `directs` and `reports_to` are TREE links: they decide where a box sits and
// a box has at most one recorded manager. Hand-offs and dotted lines are
// CROSS links, drawn as curved arrows over the tree, any number of them.
//
// Recorded links are platform.associations edges agent → agent, role
// `org_chart`, source = the box the link starts at, target = the box it points
// to, the type in metadata `link_kind` (absent = reports_to). No table of its own.

import type { OrgChartEdgeKind } from "@/components/official/org-chart/OrgChart";

/** Association role of every recorded (non-Orchestra) org chart link. */
export const ORG_CHART_ROLE = "org_chart" as const;

/** Metadata key that carries a recorded link's type (wire name). */
export const ORG_LINK_KIND_KEY = "link_kind" as const;

export const ORG_LINK_KINDS = ["directs", "reports_to", "hands_off_to", "dotted_line"] as const;
export type OrgLinkKind = (typeof ORG_LINK_KINDS)[number];

/** Link types a person records by hand (everything but the Orchestra's own). */
export type RecordedLinkKind = Exclude<OrgLinkKind, "directs">;
export const RECORDED_LINK_KINDS: readonly RecordedLinkKind[] = ["reports_to", "hands_off_to", "dotted_line"];

export interface OrgLinkKindMeta extends OrgChartEdgeKind {
  /** Decides where a box sits in the tree (one per box) vs. a cross arrow. */
  tree: boolean;
  /** The runtime acts on it. */
  enforced: boolean;
  /** "X {verb} Y" in menus and messages. */
  verb: string;
}

export const ORG_LINK_KIND_META: Record<OrgLinkKind, OrgLinkKindMeta> = {
  directs: {
    label: "Directs — Orchestra",
    description: "Runs as an Orchestra: the Conductor directs them and the work comes back.",
    color: "hsl(var(--primary))",
    tree: true,
    enforced: true,
    verb: "directs",
  },
  reports_to: {
    label: "Reports to",
    description: "Recorded structure. The agents don't act on it.",
    color: "hsl(var(--warning))",
    dashed: true,
    tree: true,
    enforced: false,
    verb: "is over",
  },
  hands_off_to: {
    label: "Hands off to",
    description: "Work passes on and doesn't come back.",
    color: "hsl(var(--success))",
    tree: false,
    enforced: false,
    verb: "hands off to",
  },
  dotted_line: {
    label: "Dotted line",
    description: "Advises or is consulted, with no authority.",
    color: "hsl(var(--muted-foreground))",
    dashed: true,
    tree: false,
    enforced: false,
    verb: "has a dotted line to",
  },
};

export function isOrgLinkKind(value: unknown): value is OrgLinkKind {
  return typeof value === "string" && (ORG_LINK_KINDS as readonly string[]).includes(value);
}

/** A recorded link's type from its edge metadata; absent or unknown reads as reports_to. */
export function recordedLinkKindOf(metadata: unknown): RecordedLinkKind {
  const raw =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>)[ORG_LINK_KIND_KEY] : undefined;
  return isOrgLinkKind(raw) && raw !== "directs" ? raw : "reports_to";
}

/** How many agent ids go into one association read. */
export const ORG_CHART_READ_CHUNK = 150;

// ── Boxes ────────────────────────────────────────────────────────────────────
// A box on the chart is one of four things (Arman, 2026-10-04). Each is an
// existing entity token, so links between any two are ordinary association
// edges. A Person is their MEMBERSHIP — their place in one organization — not
// the bare account: an org chart is per organization, and the access check
// (iam.has_access) has no rule for `user`, so no edge could ever reach one. "Position" (not "Role" — that word is owner/admin/member) is a named
// seat in agent.position that a person may fill and agents may sit under.

export const ORG_BOX_TYPES = ["agent", "membership", "team", "position"] as const;
export type OrgBoxType = (typeof ORG_BOX_TYPES)[number];

export const ORG_BOX_LABEL: Record<OrgBoxType, string> = {
  agent: "Agent",
  membership: "Person",
  team: "Team",
  position: "Position",
};

/** A box's id on the chart: `type:entityId` (an agent and a person never collide). */
export function boxId(type: OrgBoxType, entityId: string): string {
  return `${type}:${entityId}`;
}

export function isOrgBoxType(value: unknown): value is OrgBoxType {
  return typeof value === "string" && (ORG_BOX_TYPES as readonly string[]).includes(value);
}

/** `agent:123` → { type: "agent", id: "123" }. A bare id reads as an agent. */
export function parseBoxId(id: string): { type: OrgBoxType; id: string } {
  const i = id.indexOf(":");
  if (i > 0) {
    const type = id.slice(0, i);
    if (isOrgBoxType(type)) return { type, id: id.slice(i + 1) };
  }
  return { type: "agent", id };
}
