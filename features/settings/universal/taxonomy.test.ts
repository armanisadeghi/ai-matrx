const mockRange = jest.fn(() => ({
  data: [{ id: "domain", slug: "platform", name: "Platform", level: "domain", parent_id: null }],
  count: 1,
  error: null,
}));
const mockReturns = jest.fn(async () => mockRange());
const mockRangeCall = jest.fn(() => ({ returns: mockReturns }));
const mockOrder = jest.fn(() => ({ range: mockRangeCall }));
const mockSelect = jest.fn(() => ({ order: mockOrder }));
const mockReadAllRows = jest.fn(async (query: (range: { from: number; to: number }) => Promise<{ data: unknown[] }>) => {
  const result = await query({ from: 0, to: 999 });
  return result.data;
});

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ schema: () => ({ from: () => ({ select: mockSelect }) }) }),
  supabase: { auth: { getSession: jest.fn() } },
}));
jest.mock("@ai-matrx/data/db", () => ({
  readAllRows: mockReadAllRows,
  createSessionRetry: () => async (run: () => unknown) => run(),
  createActiveOrgCookie: () => ({ get: () => null, set: jest.fn(), clear: jest.fn() }),
}));
jest.mock("./UniversalSettingsPane", () => ({ __esModule: true, default: () => null }));

import { buildConfigTreeNodes } from "./configTree";
import { filterKnobsForTarget, groupDomains, systemKnob } from "./UniversalSettingsContext";
import {
  fetchTaxonomyIndex,
  taxonomyForNodeId,
  type TaxonomyIndex,
  type TaxonomyNode,
} from "./taxonomy";
import type { FeatureKnob } from "@/features/admin/limits/types";
import type { ScopedKnob } from "@/lib/scoped-config/types";

const nodes: TaxonomyNode[] = [
  { id: "domain", slug: "platform", name: "Platform", level: "domain", parent_id: null },
  { id: "feature", slug: "surfaces", name: "Surfaces", level: "feature", parent_id: "domain" },
  { id: "subfeature", slug: "tables", name: "Tables", level: "sub_feature", parent_id: "feature" },
  { id: "empty", slug: "automation", name: "Automation", level: "feature", parent_id: "domain" },
];
const taxonomy: TaxonomyIndex = {
  byId: new Map(nodes.map((node) => [node.id, node])),
  bySlug: new Map(nodes.map((node) => [node.slug, node])),
};

function userKnob(): ScopedKnob {
  return {
    feature: "platform.surfaces", key: "density", full_key: "platform.surfaces.density",
    label: "Density", description: "", value_type: "string", unit: null, allowed_values: null,
    min_value: null, max_value: null, basis: null, set_by: "human", review_due: null,
    overridable_by: ["user"], override_direction: "any", bound_value: null,
    platform_locked: false, org_locked_kinds: [], user_override_locked: false,
    platform_default: "comfortable", shipped_default: "comfortable", org_override: null,
    user_override: null, effective_value: "comfortable", origin: "platform_default",
    origin_scope_id: null, origin_precedence: null, is_overridden: false, out_of_range: false,
    ui: {}, taxonomy: taxonomyForNodeId("subfeature", taxonomy), propagation: "next_load",
    scope_chain: [], locked: null, write_rung: null, can_write: true, can_write_reason: null, secret: null,
  };
}

describe("universal settings taxonomy", () => {
  beforeEach(() => jest.clearAllMocks());

  it("keeps a canonical feature visible when it has no registered controls", () => {
    const domains = groupDomains([], taxonomy, true);
    const tree = buildConfigTreeNodes(domains);
    const platform = tree[0]?.children?.find((node) => node.label === "Platform");
    expect(platform?.children).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Automation", description: "No controls registered yet" }),
    ]));
  });

  it("files system and user rows under the same canonical feature", () => {
    const row: FeatureKnob = {
      feature: "platform.surfaces", key: "density", value: "comfortable", default_value: "comfortable",
      value_type: "string", unit: null, min_value: null, max_value: null, allowed_values: null,
      label: "Density", description: "", set_by: "human", basis: null, review_due: null,
      overridable_by: ["user"], override_direction: "any", bound_value: null, ui: {},
      taxonomy_node_id: "subfeature", propagation: "next_load",
    };
    const system = systemKnob(row, taxonomy);
    expect(system.taxonomy).toEqual(userKnob().taxonomy);
    expect(groupDomains([system], taxonomy, true)[0]?.features.find((feature) => feature.slug === "surfaces")?.knobs).toHaveLength(1);
    expect(groupDomains([userKnob()], taxonomy)[0]?.features.find((feature) => feature.slug === "surfaces")?.knobs).toHaveLength(1);
  });

  it("pages the complete taxonomy metadata read", async () => {
    await fetchTaxonomyIndex();
    expect(mockReadAllRows).toHaveBeenCalledWith(expect.any(Function), {
      label: "platform.taxonomy_node (universal settings)",
    });
    expect(mockSelect).toHaveBeenCalledWith("id, slug, name, level, parent_id", { count: "exact" });
    expect(mockOrder).toHaveBeenCalledWith("id", { ascending: true });
    expect(mockRangeCall).toHaveBeenCalledWith(0, 999);
  });

  it("keeps a sub-feature's controls under its canonical feature", () => {
    expect(taxonomyForNodeId("subfeature", taxonomy)?.feature_name).toBe("Surfaces");
  });

  it("never exposes an organization-only control on the user destination", () => {
    const organizationOnly: ScopedKnob = { ...userKnob(), overridable_by: ["organization"] };
    expect(filterKnobsForTarget([userKnob(), organizationOnly], "user")).toEqual([userKnob()]);
    expect(filterKnobsForTarget([userKnob(), organizationOnly], "organization")).toEqual([organizationOnly]);
  });
});
