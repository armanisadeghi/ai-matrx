/**
 * The admin mandate list's in-memory query engine and origin derivations.
 * Real mandate keys from the platform corpus; the rows carry only the fields
 * the engine reads.
 */
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import type { EntityListQuery } from "@/lib/entity-list/types";
import {
  countsOf,
  facetsOf,
  pageOf,
  queryRows,
} from "../service";
import {
  customizedByOf,
  declaredInOf,
  featureLabelOf,
} from "../rows";
import type { MandateAdminRow } from "../types";
import type { MandateCodeTruth } from "@/features/mandates/admin/service";

const ME = "user-me";
const ORG = "org-acme";

function row(partial: Partial<MandateAdminRow> & { mandateKey: string }): MandateAdminRow {
  return {
    id: partial.mandateKey,
    name: partial.mandateKey,
    featureLabel: partial.mandateKey.split(".")[0],
    agentName: "Agent",
    holderType: "agent",
    pinText: "Latest",
    coverage: "green",
    impactGrade: "ungraded",
    impactBlocker: "ungraded",
    health: "ok",
    inputSummary: "",
    outputSummary: "",
    overridesCount: 0,
    customizedBy: ["Default"],
    isEnabled: true,
    updatedAt: null,
    createdAt: null,
    origin: "code",
    codeState: "declared",
    declaredIn: "Python · aidream",
    serves: ["Feature code"],
    servesDetail: [],
    defaultState: "Own default",
    backsCount: 0,
    fallbackKey: null,
    homeLabel: "System",
    goal: null,
    createdBy: null,
    organizationId: "system",
    isSystem: true,
    ...partial,
  } as MandateAdminRow;
}

const ROWS: MandateAdminRow[] = [
  row({ mandateKey: "flashcards.enrich_card", name: "Enrich Card" }),
  row({ mandateKey: "podcast.audience_adapter", name: "Audience Adapter" }),
  row({
    mandateKey: "shortcut.action_item_extractor",
    name: "Action Item Extractor",
    origin: "soft",
    codeState: "not_in_code",
    declaredIn: null,
    serves: ["Shortcut"],
    isSystem: false,
    organizationId: ORG,
    homeLabel: "Acme",
    createdBy: ME,
    customizedBy: ["Acme", "Personal"],
  }),
  row({
    mandateKey: "app.cover_letter",
    name: "Cover Letter",
    origin: "soft",
    serves: ["Agent app", "Surface"],
    isSystem: false,
    organizationId: ORG,
    homeLabel: "Acme",
  }),
];

const viewer = { userId: ME };
const q = (patch: Partial<EntityListQuery>): EntityListQuery => ({
  ...DEFAULT_ENTITY_LIST_QUERY,
  ...patch,
});

describe("scopes", () => {
  it("Mine is what the viewer created; Org and System split by home", () => {
    expect(queryRows(ROWS, q({ scope: { kind: "mine" } }), viewer, null).map((r) => r.mandateKey)).toEqual([
      "shortcut.action_item_extractor",
    ]);
    expect(queryRows(ROWS, q({ scope: { kind: "system" } }), viewer, null)).toHaveLength(2);
    expect(queryRows(ROWS, q({ scope: { kind: "orgs", organizationId: ORG } }), viewer, null)).toHaveLength(2);
  });

  it("counts every tab under the same search and filters, with org narrowing", () => {
    const counts = countsOf(ROWS, q({ filters: { origin: { kind: "select", values: ["soft"] } } }), viewer, { [ORG]: "Acme" });
    expect(counts.byKind).toEqual({ mine: 1, orgs: 2, system: 0 });
    expect(counts.narrow.orgs).toEqual([{ id: ORG, label: "Acme", count: 2 }]);
  });
});

describe("origin filters", () => {
  it("filters a multi-valued column by any of its values", () => {
    const rows = queryRows(ROWS, q({ scope: { kind: "orgs", organizationId: null }, filters: { serves: { kind: "select", values: ["Surface"] } } }), viewer, null);
    expect(rows.map((r) => r.mandateKey)).toEqual(["app.cover_letter"]);
  });

  it("a facet's counts ignore its own filter, so other options stay visible", () => {
    const facets = facetsOf(ROWS, q({ scope: { kind: "system" }, filters: { origin: { kind: "select", values: ["code"] } } }), { userId: ME });
    expect(facets.byKind.origin).toEqual([{ value: "code", count: 2 }]);
    const all = facetsOf(ROWS, q({ scope: { kind: "orgs", organizationId: null }, filters: { origin: { kind: "select", values: ["code"] } } }), viewer);
    expect(all.byKind.origin).toEqual([{ value: "soft", count: 2 }]);
    expect(all.byKind.customizedBy).toEqual([]);
  });
});

describe("sort, search and paging", () => {
  it("sorts by the column's own value and pages the whole result", () => {
    const page = pageOf(ROWS, q({ scope: { kind: "system" } }), viewer, { sort: "name", direction: "desc", favoritesFirst: false, pageSize: 1 });
    expect(page.total).toBe(2);
    expect(page.rows[0].name).toBe("Enrich Card");
  });

  it("search matches the key and ranks over the whole scope", () => {
    const rows = queryRows(ROWS, q({ scope: { kind: "system" }, search: "audience" }), viewer, null);
    expect(rows[0].mandateKey).toBe("podcast.audience_adapter");
  });
});

describe("derivations", () => {
  it("customized by: Default when nobody bound it, else org names / Personal / Global", () => {
    expect(customizedByOf([], {})).toEqual(["Default"]);
    expect(
      customizedByOf(
        [
          { principal_type: "org", organization_id: "o1" },
          { principal_type: "org", organization_id: "o2" },
          { principal_type: "user", organization_id: null },
        ],
        { o1: "Beta", o2: "Acme" },
      ),
    ).toEqual(["Acme", "Beta", "Personal"]);
  });

  it("feature label from the key, with the declaring module's sub-area", () => {
    expect(featureLabelOf("seo.ai_visibility_decision_analyst", "aidream.services.seo.ai_visibility")).toBe("SEO › AI Visibility");
    expect(featureLabelOf("podcast.audience_adapter", "aidream.services.podcast.mandates")).toBe("Podcast");
    expect(featureLabelOf("content_plan.brief_writer", null)).toBe("Content Plan");
    expect(featureLabelOf("shortcut.action_item_extractor", null)).toBe("Shortcuts");
  });

  it("declared in: the code declaration's file, or the generated declared key set", () => {
    const truth = {
      mandate_key: "podcast.audience_adapter",
      resolution: "code_declaration_found",
      source: { class_name: "X", module: "aidream.services.podcast.mandates", source_file: "aidream/services/podcast/mandates.py", line: 41 },
    } as unknown as MandateCodeTruth;
    expect(declaredInOf("podcast.audience_adapter", truth)).toEqual({
      declaredIn: "Python · aidream",
      declaredFile: "aidream/services/podcast/mandates.py:41",
      codeState: "declared",
    });
    // Class inspection missed it, but aidream declares it (generated key set).
    expect(
      declaredInOf("flashcards.enrich_card", {
        ...truth,
        resolution: "no_code_declaration_found",
        source: null,
      } as unknown as MandateCodeTruth),
    ).toEqual({ declaredIn: "Python · aidream", declaredFile: null, codeState: "declared" });
    // A shortcut authored in the database is declared nowhere.
    expect(declaredInOf("shortcut.action_item_extractor", undefined)).toEqual({
      declaredIn: null,
      declaredFile: null,
      codeState: "not_in_code",
    });
  });

});
