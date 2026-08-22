/**
 * OUTPUT DEFINITIONS — every output a research topic can produce, as data.
 *
 * The point of the resource-catalog work is that a new domain-specific output is
 * an AGENT row plus a BUNDLE row, not new code. This registry is where that
 * shows up on the client: each entry names the agent and the system bundle slug
 * that feeds it, and nothing here contains generation logic.
 *
 * Two families:
 *
 *   PUBLISHING outputs (podcast, blog, slides, SEO) turn the finished report
 *   into a format. They all consume `research-report-only` — the same single
 *   markdown blob they always did, now expressed as a bundle so the generic path
 *   and the domain path are one mechanism.
 *
 *   DOMAIN outputs (brand profile, reputation, gap analysis, literature review,
 *   competitive landscape) read the RESEARCH, not the report. Each has its own
 *   bundle selecting different resources with different ordering and caps, and
 *   each declares the variables its agent expects. Adding the next one is a SQL
 *   insert plus one entry below.
 *
 * Each domain output names its AGENT MANDATE, never an agent id: the mandate is
 * the identity (system default managed in the admin console; a user may bind
 * their own agent via `<MandateAgentPicker>`), resolved at the launch point
 * (the Context Builder runs `launchMandate(mandateKey)`). The mandates are
 * declared server-side in aidream `client_mandates.py`. Bundle slugs are the
 * stable keys in `research.rs_context_bundle`
 * (migrations/research_system_context_bundles.sql) — that row's `agent_id` is a
 * SEED MIRROR of the mandate's system default, not a second authority.
 * SoR: common-docs/systems/agents/mandates/FEATURE.md.
 */

/** The bundle every publishing output uses — the report, and nothing else. */
export const REPORT_ONLY_BUNDLE_SLUG = "research-report-only";

export interface DomainOutputDefinition {
  /** Stable id, also the deep-link value on the Context Builder. */
  slug: string;
  label: string;
  /** One line: what this produces and what it reads. */
  description: string;
  /** The mandate whose resolved agent writes it (`research_client.output_*`). */
  mandateKey: string;
  /** System bundle that feeds it. */
  bundleSlug: string;
}

/**
 * Domain reports — the outputs that consume the research itself.
 *
 * They run through the Context Builder (`/research/topics/[id]/context?bundle=`)
 * so there is exactly ONE run path in the product: load the bundle, see what the
 * agent will receive and what it costs, then run. A second "just press go" path
 * here would be the same code twice, and the one that hid the inputs would be
 * the one that quietly sent the wrong thing.
 */
export const DOMAIN_OUTPUTS: DomainOutputDefinition[] = [
  {
    slug: "research-brand-profile",
    label: "Brand profile",
    description:
      "The brand plus its key people, partners and reputation signals — from authority-ranked pages, the full search footprint and the analyses.",
    mandateKey: "research_client.output_brand_profile",
    bundleSlug: "research-brand-profile",
  },
  {
    slug: "research-reputation-business",
    label: "Reputation review — business",
    description:
      "How a business reads to someone searching it: positive and negative signals with attribution, review themes, and legitimate remediation.",
    mandateKey: "research_client.output_reputation_business",
    bundleSlug: "research-reputation-business",
  },
  {
    slug: "research-reputation-personal",
    label: "Reputation review — personal",
    description:
      "An individual's public professional record: credential verification, independent vs self-published signals, same-name confusion checks.",
    mandateKey: "research_client.output_reputation_personal",
    bundleSlug: "research-reputation-personal",
  },
  {
    slug: "research-gap-analysis",
    label: "Gap analysis",
    description:
      "What this research is MISSING — unsearched keywords, thin single-source claims, absent viewpoints, and what to research next.",
    mandateKey: "research_client.output_gap_analysis",
    bundleSlug: "research-gap-analysis",
  },
  {
    slug: "research-literature-review",
    label: "Literature & evidence review",
    description:
      "Findings by theme with strength-of-support ratings, contested evidence, and a critique of the corpus itself.",
    mandateKey: "research_client.output_literature_review",
    bundleSlug: "research-literature-review",
  },
  {
    slug: "research-competitive-landscape",
    label: "Competitive landscape",
    description:
      "Per-competitor profiles, a comparison table, positioning clusters and whitespace — grouped by the entity each source is about.",
    mandateKey: "research_client.output_competitive_landscape",
    bundleSlug: "research-competitive-landscape",
  },
];

/** The domain output a bundle slug belongs to, if any — how the Context
 *  Builder knows which mandate a loaded SYSTEM bundle runs through. */
export function domainOutputForBundleSlug(
  slug: string | null,
): DomainOutputDefinition | null {
  if (!slug) return null;
  return DOMAIN_OUTPUTS.find((d) => d.bundleSlug === slug) ?? null;
}

/** Deep link to the Context Builder with a bundle preloaded. */
export function contextBuilderHref(topicId: string, bundleSlug: string): string {
  return `/research/topics/${topicId}/context?bundle=${encodeURIComponent(bundleSlug)}`;
}
