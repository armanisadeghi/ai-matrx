import {
  PLACEMENT_RULES,
  isTarget,
  keyInTarget,
  legacyDestination,
  placementForKey,
  targetForKey,
  targetLabel,
  targetPrefixes,
} from "../placement";
import { REGISTRY_DOMAINS, registryDomain, registryFeature } from "../taxonomy";
import { DECLARED_FEATURES } from "../registry";
import { LIVE_MANDATE_KEYS_2026_09_26 } from "./live-keys.fixture";

/** Custom jobs an organization or a person wrote under their own prefix. */
const OWNER_AUTHORED = new Set([
  "org_riverside_clinic.patient_intake_summary",
  "organization.referral_letter_drafter",
  "organization.supplier_invoice_checker",
  "personal.site_visit_follow_up_email",
]);

describe("registry placement", () => {
  it("names only real registry nodes — never an invented domain or feature", () => {
    for (const rule of PLACEMENT_RULES) {
      expect(registryDomain(rule.domain)).not.toBeNull();
      if (rule.feature !== null) {
        expect(registryFeature(rule.feature)?.domain).toBe(rule.domain);
      }
    }
  });

  it("has no two rules with the same pattern", () => {
    const patterns = PLACEMENT_RULES.map((rule) => rule.pattern);
    expect(new Set(patterns).size).toBe(patterns.length);
  });

  it("feature ids are unique across the whole registry, so one id is one page", () => {
    const ids = REGISTRY_DOMAINS.flatMap((domain) =>
      domain.features.map((feature) => feature.id),
    );
    expect(new Set(ids).size).toBe(ids.length);
    for (const domain of REGISTRY_DOMAINS)
      expect(ids).not.toContain(`${domain.id}/unassigned`);
  });

  it("places every live job on a Domain; only owner-authored jobs and fixtures have none", () => {
    const noDomain = LIVE_MANDATE_KEYS_2026_09_26.filter(
      (key) => placementForKey(key).domain === null,
    );
    const unexplained = noDomain.filter(
      (key) => !OWNER_AUTHORED.has(key) && !placementForKey(key).fixture,
    );
    expect(unexplained).toEqual([]);
  });

  it("splits the prefixes that span several registry features", () => {
    expect(targetForKey("seo.finding_fixer")).toBe("seo");
    expect(targetForKey("seo.press_story_analyst")).toBe("public-relations");
    expect(targetForKey("seo.competitor_classifier")).toBe(
      "competitor-classification",
    );
    expect(targetForKey("crm.outreach_pitch_writer")).toBe("outreach");
    expect(targetForKey("crm.save_contact")).toBe("party");
    expect(targetForKey("education.quiz_generate")).toBe("quizzes-and-tests");
    expect(targetForKey("education.fastfire_guidance")).toBe("flashcards");
    expect(targetForKey("education.admin_guidance")).toBe(
      "education/unassigned",
    );
    expect(targetForKey("masterwork.rule_improver")).toBe("rulebooks");
    expect(targetForKey("masterwork.scout")).toBe("distillation");
    expect(targetForKey("masterwork.template.maker")).toBe(
      "agent-creation-studio",
    );
    expect(targetForKey("workflow.plan_design")).toBe("plan-nodes");
    expect(targetForKey("workflow.steward.data")).toBe("workflow-authoring");
    expect(targetForKey("workflow.complex_research.report")).toBe(
      "workflows/unassigned",
    );
    expect(targetForKey("voice.owner_beta")).toBe("voice-calls");
    expect(targetForKey("voice.intro")).toBe("voice");
    expect(targetForKey("organization.referral_letter_drafter")).toBe(
      "unassigned",
    );
  });

  it("a target's prefixes cover every key that lands on it", () => {
    for (const key of LIVE_MANDATE_KEYS_2026_09_26) {
      const target = targetForKey(key);
      const prefixes = targetPrefixes(target);
      if (prefixes === null) continue;
      expect(prefixes).toContain(key.slice(0, key.indexOf(".")));
      expect(keyInTarget(key, target)).toBe(true);
    }
  });

  it("labels are the registry's own words", () => {
    expect(targetLabel("seo")).toBe("Seo");
    expect(targetLabel("local-listings")).toBe("Local Listings");
    expect(targetLabel("education/unassigned")).toBe(
      "Education: not yet assigned to a feature",
    );
    expect(targetLabel("unassigned")).toBe("Not yet assigned to a domain");
    expect(isTarget("seo")).toBe(true);
    expect(isTarget("marketing")).toBe(false);
    expect(isTarget("marketing/unassigned")).toBe(true);
  });

  it("every old page id lands somewhere real", () => {
    const old = [
      ...DECLARED_FEATURES.map(
        (entry) => [entry.feature, entry.extraPrefixes ?? []] as const,
      ),
      ...[
        "shortcut",
        "app",
        "local",
        "ner",
        "masterworks",
        "cms",
        "google",
        "kg",
        "memory",
        "image",
      ].map((id) => [id, [] as readonly string[]] as const),
    ];
    for (const [id, extra] of old) {
      const destination = legacyDestination(id, extra);
      expect({ id, destination }).toEqual({
        id,
        destination: expect.anything(),
      });
      if (destination && "target" in destination)
        expect(isTarget(destination.target)).toBe(true);
      if (destination && "domain" in destination)
        expect(registryDomain(destination.domain)).not.toBeNull();
    }
    expect(legacyDestination("marketing", ["seo"])).toEqual({
      domain: "marketing",
    });
    expect(legacyDestination("podcast", ["podcast_client"])).toEqual({
      target: "podcasts",
    });
    expect(legacyDestination("flashcards")).toEqual({ target: "flashcards" });
    expect(legacyDestination("content_plan")).toEqual({
      target: "content-planning",
    });
    expect(legacyDestination("education")).toEqual({ domain: "education" });
    expect(legacyDestination("conversation")).toEqual({ target: "chat" });
  });
});
