// features/make/tiles.ts — LANE MAKE-HOME (v6 Unified Data System), wave 1.
//
// THE /make HUB'S TILE REGISTRY: one row per thing a person can make from the record store, and
// nothing else. Registry v1 (PROGRESS-MAKE-HOME.md § "Tile registry v1", after a plan-attack): seven
// tiles, each with a flow that WORKS today. Absent beats dead — a tile without a working flow is not
// listed, and `check:make-no-dead-tile` (features/make/__tests__/make-no-dead-tile.test.tsx) fails
// when a tile names a flow that has no first step.
//
// `what` is the tile's secondary line: ≤ 60 characters, one line (interface-text). `champion` is
// author-facing (who we measure the flow against) and never renders.
//
// Flows:
//   table      — TablesHome `makingOnly` (blank, from an example, or a file) in the organization
//                new things are saved to.
//   form · booking · checklist · dashboard
//              — the shared first step "Which table, or make one?" (TableChoice), then the
//                table's own builder, made NEW on open (records-ui createOnMount / startNew).
//   portal     — PortalBuilder, which asks for its own clients' table.
//   list       — a link to /lists, where New pick list lives.

/** The flows a tile can open. Every one is drawn by `features/make/MakeFlowSheet.tsx`. */
export type MakeFlow = "table" | "form" | "booking" | "checklist" | "dashboard" | "portal" | "list";

/** The store's kind word for the icon (`features/unified-data/home/dataHomeColumns.tsx` KindIcon). */
export type MakeKind = "table" | "form" | "booking" | "checklist" | "dashboard" | "portal" | "list";

export interface MakeTile {
  id: MakeFlow;
  label: string;
  /** ≤ 60 characters, one line. */
  what: string;
  flow: MakeFlow;
  kind: MakeKind;
  /** Author-facing: the world champion the flow is measured against. Never rendered. */
  champion: string;
  /** Does the flow start with "Which table, or make one?" */
  asksForTable: boolean;
  /** A tile that leaves for another page instead of opening a sheet. */
  href?: string;
}

export const MAKE_TILES: readonly MakeTile[] = [
  {
    id: "table",
    label: "Table",
    what: "Rows and columns for anything you track",
    flow: "table",
    kind: "table",
    champion: "Airtable Home — start from scratch, a template or an import",
    asksForTable: false,
  },
  {
    id: "form",
    label: "Form",
    what: "Anyone with the link can answer",
    flow: "form",
    kind: "form",
    champion: "Typeform, Tally",
    asksForTable: true,
  },
  {
    id: "booking",
    label: "Booking page",
    what: "Let people pick a time with you",
    flow: "booking",
    kind: "booking",
    champion: "Calendly",
    asksForTable: true,
  },
  {
    id: "checklist",
    label: "Checklist",
    what: "Steps that start on every new record",
    flow: "checklist",
    kind: "checklist",
    champion: "Process Street",
    asksForTable: true,
  },
  {
    id: "dashboard",
    label: "Dashboard",
    what: "Charts over one table's records",
    flow: "dashboard",
    kind: "dashboard",
    champion: "Airtable Interfaces",
    asksForTable: true,
  },
  {
    id: "portal",
    label: "Client portal",
    what: "Clients sign in and see only their own",
    flow: "portal",
    kind: "portal",
    champion: "Softr client portals",
    asksForTable: false,
  },
  {
    id: "list",
    label: "Pick list",
    what: "One list of choices, used everywhere",
    flow: "list",
    kind: "list",
    champion: "Airtable single select, Notion select options",
    asksForTable: false,
    href: "/lists",
  },
];

/** The URL parameter that holds the open flow, so Back closes it (B3). */
export const MAKE_FLOW_PARAM = "make";
/** The URL parameters a flow's step 1 answer rides in once chosen. */
export const MAKE_TABLE_PARAM = "table";
export const MAKE_ORG_PARAM = "org";

export function tileFor(flow: string | null | undefined): MakeTile | null {
  return MAKE_TILES.find((t) => t.flow === flow) ?? null;
}
