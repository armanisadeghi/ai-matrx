/**
 * Per-column search and the one-pick-per-column drill path — the engine half
 * of the Miller Columns / DrillDeck primitive (lane CONTEXT-INSPECTOR-3).
 * Pure functions; no mocks.
 */
import {
  COLUMN_SEARCH_THRESHOLD,
  EMPTY_DRILL_PATH,
  applyDrillPick,
  columnShowsSearch,
  drillPathForScope,
  drillPathNodes,
  filterColumnRows,
  itemNodeOf,
  orgNodeOf,
  scopeNodeOf,
  typeNodeOf,
} from "../engine";
import type { OrgNode, ScopeTypeNode } from "@/features/scopes/types";

const CLIENT_NAMES = [
  "Golden State Indemnity Co.",
  "Meridian Risk Services",
  "Pacific Coast Freight Lines",
  "Harbor View Medical Group",
  "Sierra Madre Vineyards",
  "Coronado Marine Supply",
  "Mesa Verde Builders",
  "Torrey Pines Biotech",
  "La Jolla Dental Partners",
  "Escondido Citrus Growers",
];

function clientsType(): ScopeTypeNode {
  return {
    id: "type-clients",
    organization_id: "org-castellano",
    label_singular: "Client",
    label_plural: "Clients",
    icon: "briefcase",
    color: "blue",
    max_assignments_per_entity: null,
    sort_order: 1,
    parent_type_id: null,
    default_variable_keys: [],
    scopes: CLIENT_NAMES.map((name, index) => ({
      id: `scope-${index}`,
      scope_type_id: "type-clients",
      organization_id: "org-castellano",
      name,
      description: "",
      parent_scope_id: null,
      settings: {},
    })),
  };
}

const orgs = [
  {
    id: "org-castellano",
    name: "Castellano & Reyes, LLP",
    scope_types: [clientsType()],
  },
] as unknown as OrgNode[];

describe("per-column search", () => {
  it("shows the search box only on a column longer than the threshold", () => {
    expect(COLUMN_SEARCH_THRESHOLD).toBe(8);
    expect(columnShowsSearch(8)).toBe(false);
    expect(columnShowsSearch(9)).toBe(true);
  });

  it("narrows a column by every term of the query, case-insensitive", () => {
    const scopes = orgs[0].scope_types[0].scopes;
    const byName = (q: string) =>
      filterColumnRows(scopes, q, (s) => s.name).map((s) => s.name);
    expect(byName("meridian")).toEqual(["Meridian Risk Services"]);
    expect(byName("MES")).toEqual(["Mesa Verde Builders"]);
    expect(byName("co")).toEqual([
      "Golden State Indemnity Co.",
      "Pacific Coast Freight Lines",
      "Coronado Marine Supply",
      "Escondido Citrus Growers",
    ]);
    expect(byName("coast lines")).toEqual(["Pacific Coast Freight Lines"]);
    expect(byName("nothing like this")).toEqual([]);
  });

  it("keeps every row, in order, for an empty or blank query", () => {
    const scopes = orgs[0].scope_types[0].scopes;
    expect(filterColumnRows(scopes, "", (s) => s.name)).toEqual(scopes);
    expect(filterColumnRows(scopes, "   ", (s) => s.name)).toEqual(scopes);
  });
});

describe("drill path — one pick per column", () => {
  const org = orgs[0];
  const type = org.scope_types[0];
  const meridian = type.scopes[1];
  const orgNode = orgNodeOf(org);
  const typeNode = typeNodeOf(org, type);
  const scopeNode = scopeNodeOf(org, type, meridian);
  const phone = itemNodeOf(scopeNode, { id: "item-phone", label: "Contact Phone" });

  it("sets the picked column and clears every column after it", () => {
    let path = applyDrillPick(EMPTY_DRILL_PATH, orgNode);
    expect(path).toEqual({ ...EMPTY_DRILL_PATH, orgId: org.id });
    path = applyDrillPick(path, typeNode);
    path = applyDrillPick(path, scopeNode);
    path = applyDrillPick(path, phone);
    expect(path).toEqual({
      orgId: org.id,
      typeId: type.id,
      scopeId: meridian.id,
      itemId: "item-phone",
    });
    // Re-picking the type keeps the org and clears scope + item.
    expect(applyDrillPick(path, typeNode)).toEqual({
      ...EMPTY_DRILL_PATH,
      orgId: org.id,
    });
    // Picking the item that is on clears only the item.
    expect(applyDrillPick(path, phone)).toEqual({ ...path, itemId: null });
    // A scope picked straight away fills its org and type.
    expect(applyDrillPick(EMPTY_DRILL_PATH, scopeNode)).toEqual({
      orgId: org.id,
      typeId: type.id,
      scopeId: meridian.id,
      itemId: null,
    });
  });

  it("locates a bare scope id in the universe (the ?scope= back-fill)", () => {
    expect(drillPathForScope(orgs, meridian.id)).toEqual({
      orgId: org.id,
      typeId: type.id,
      scopeId: meridian.id,
      itemId: null,
    });
    expect(drillPathForScope(orgs, "not-a-scope")).toBeNull();
  });

  it("resolves the picked nodes for the footer summary", () => {
    const nodes = drillPathNodes(
      orgs,
      { orgId: org.id, typeId: type.id, scopeId: meridian.id, itemId: "item-phone" },
      "Contact Phone",
    );
    expect(nodes.map((n) => `${n.kind}:${n.label}`)).toEqual([
      "org:Castellano & Reyes, LLP",
      "type:Clients",
      "scope:Meridian Risk Services",
      "item:Contact Phone",
    ]);
  });
});
