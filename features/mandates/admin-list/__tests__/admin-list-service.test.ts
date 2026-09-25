/**
 * The admin mandate list's server contract (the client half) and its origin
 * derivations. Paging, sorting, filtering, search and counts run in
 * `public.mnd_admin_list`; what the browser owns is WHICH aidream-classified
 * facts a query must carry, their packing, and reading the answers back.
 * Real mandate keys from the platform corpus.
 */
import { DEFAULT_ENTITY_LIST_QUERY } from "@/lib/entity-list/types";
import type { EntityListQuery } from "@/lib/entity-list/types";
import type { MandateCodeTruth } from "@/features/mandates/admin/service";
import type { StandingImpact } from "@/features/mandates/admin/impact";
import type { MandateCoverageResponse } from "@/features/mandates/coverage";
import { buildFacts, sectionsFor, ALL_FACT_SECTIONS } from "../facts";
import { countsFromAnswer, scopeArgs } from "../service";
import { customizedByOf, declaredInOf, featureLabelOf } from "../rows";

function query(partial: Partial<EntityListQuery> = {}): EntityListQuery {
  return { ...DEFAULT_ENTITY_LIST_QUERY, scope: { kind: "system" }, ...partial };
}

const truth = (key: string, extra: Record<string, unknown>) =>
  ({ mandate_key: key, resolution: "code_declaration_found", drift: "match", bound_agent_drift: "match", source: null, ...extra }) as unknown as MandateCodeTruth;

describe("which facts a query carries", () => {
  it("carries nothing for a plain page — the database answers alone", () => {
    expect(sectionsFor(query(), "name")).toEqual([]);
  });

  it("carries a section for each filtered or sorted server-classified column", () => {
    const q = query({ filters: { coverage: { kind: "select", values: ["red"] }, origin: { kind: "select", values: ["soft"] } } });
    expect(sectionsFor(q, "impactGrade").sort()).toEqual(["coverage", "grade"]);
    // The Default column's "Fallback" reads the coverage report's orange keys.
    expect(sectionsFor(query({ filters: { defaultState: { kind: "select", values: ["Fallback"] } } }))).toEqual(["coverage"]);
  });

  it("carries the feature labels while searching (the scorer reads them)", () => {
    expect(sectionsFor(query({ search: "podcast" }), null)).toEqual(["featureLabel"]);
  });
});

describe("packing the facts", () => {
  const reports = {
    codeTruth: {
      "seo.ai_visibility_decision_analyst": truth("seo.ai_visibility_decision_analyst", {
        source: { module: "aidream.services.seo.ai_visibility", source_file: "aidream/services/seo/ai_visibility/mandates.py", line: 3 },
        bound_agent_drift: "variables_differ",
      }),
      "podcast.audience_adapter": truth("podcast.audience_adapter", { resolution: "code_exists_but_import_failed" }),
    },
    coverage: { red: [{ mandate_key: "flashcards.enrich_card" }], orange: [{ mandate_key: "podcast.show_notes" }] } as unknown as MandateCoverageResponse,
    impact: null as StandingImpact | null,
    workflowImpact: null,
  };

  it("sends only the sections asked for", () => {
    expect(Object.keys(buildFacts(reports, ["coverage"]))).toEqual(["coverage"]);
    expect(buildFacts(reports, ["coverage"]).coverage).toEqual({
      known: true,
      red: ["flashcards.enrich_card"],
      orange: ["podcast.show_notes"],
    });
  });

  it("an unanswered report sends no section, so the column reads unknown — never a verdict", () => {
    const facts = buildFacts(
      { codeTruth: null, coverage: null, impact: null, workflowImpact: null },
      ALL_FACT_SECTIONS,
    );
    expect(facts.coverage).toBeUndefined();
    expect(facts.grade).toBeUndefined();
  });

  it("code facts: sub-area labels, health overlays, declared state", () => {
    const facts = buildFacts(reports, ["featureLabel", "health", "codeState"]) as {
      featureLabel: Record<string, string>;
      health: Record<string, string[]>;
      codeState: Record<string, string[]>;
    };
    expect(facts.featureLabel["seo.ai_visibility_decision_analyst"]).toBe("SEO › AI Visibility");
    expect(facts.featureLabel["podcast.audience_adapter"]).toBeUndefined();
    expect(facts.health.agentDrift).toEqual(["seo.ai_visibility_decision_analyst"]);
    expect(facts.health.importFailed).toEqual(["podcast.audience_adapter"]);
    expect(facts.codeState.import_failed).toEqual(["podcast.audience_adapter"]);
    expect(facts.codeState.declared).toContain("seo.ai_visibility_decision_analyst");
  });
});

describe("reading the answers", () => {
  it("scope arguments: the org narrowing only on the Org tab", () => {
    expect(scopeArgs(query({ scope: { kind: "orgs", organizationId: "org-1" } })).p_org_id).toBe("org-1");
    expect(scopeArgs(query({ scope: { kind: "orgs", organizationId: null } })).p_org_id).toBeUndefined();
    expect(scopeArgs(query({ search: "  " })).p_search).toBeUndefined();
  });

  it("tab counts and org narrowing", () => {
    expect(
      countsFromAnswer({ mine: 102, orgs: 103, system: 469, orgs_narrow: [{ id: "o1", label: "Titanium", count: 2 }] }),
    ).toEqual({ byKind: { mine: 102, orgs: 103, system: 469 }, narrow: { orgs: [{ id: "o1", label: "Titanium", count: 2 }] } });
    expect(countsFromAnswer({ mine: 0, orgs: 0, system: 1, orgs_narrow: [] }).narrowUnavailable).toEqual({
      orgs: "No organization mandates.",
    });
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
