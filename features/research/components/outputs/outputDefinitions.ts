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
 * SoR: common-docs/systems/mandates/FEATURE.md.
 */

import type { OutputKind } from "./outputs";
import type { MandateKey } from "@ai-matrx/agents/mandates";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** The bundle every publishing output uses — the report, and nothing else. */
export const REPORT_ONLY_BUNDLE_SLUG = "research-report-only";

export interface DomainOutputDefinition {
  /** Stable id, also the deep-link value on the Context Builder. */
  slug: string;
  label: string;
  /** One line: what this produces and what it reads. */
  description: string;
  /** The mandate whose resolved agent writes it (`research_client.output_*`). */
  mandateKey: MandateKey;
  /** System bundle feeding the Context Builder; null when openHref owns the run path. */
  bundleSlug: string | null;
  /** Slot in `rs_topic.outputs` where a generated report persists (D5). */
  outputKind: OutputKind;
  /**
   * Where the card opens INSTEAD of the Context Builder — for an output that
   * runs through its own entry (the topical map runs through
   * `POST /seo/brands/{brand_id}/map/author`, a durable command with its own
   * screen). Exactly one of `bundleSlug` / `openHref` is the run path.
   */
  openHref?: (topicId: string) => string;
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
    mandateKey: MANDATE_KEYS.research_client__output_brand_profile,
    bundleSlug: "research-brand-profile",
    outputKind: "brand_profile",
  },
  {
    slug: "research-reputation-business",
    label: "Reputation review — business",
    description:
      "How a business reads to someone searching it: positive and negative signals with attribution, review themes, and legitimate remediation.",
    mandateKey: MANDATE_KEYS.research_client__output_reputation_business,
    bundleSlug: "research-reputation-business",
    outputKind: "reputation_business",
  },
  {
    slug: "research-reputation-personal",
    label: "Reputation review — personal",
    description:
      "An individual's public professional record: credential verification, independent vs self-published signals, same-name confusion checks.",
    mandateKey: MANDATE_KEYS.research_client__output_reputation_personal,
    bundleSlug: "research-reputation-personal",
    outputKind: "reputation_personal",
  },
  {
    slug: "research-gap-analysis",
    label: "Gap analysis",
    description:
      "What this research is MISSING — unsearched keywords, thin single-source claims, absent viewpoints, and what to research next.",
    mandateKey: MANDATE_KEYS.research_client__output_gap_analysis,
    bundleSlug: "research-gap-analysis",
    outputKind: "gap_analysis",
  },
  {
    slug: "research-literature-review",
    label: "Literature & evidence review",
    description:
      "Findings by theme with strength-of-support ratings, contested evidence, and a critique of the corpus itself.",
    mandateKey: MANDATE_KEYS.research_client__output_literature_review,
    bundleSlug: "research-literature-review",
    outputKind: "literature_review",
  },
  {
    slug: "research-competitive-landscape",
    label: "Competitive landscape",
    description:
      "Per-competitor profiles, a comparison table, positioning clusters and whitespace — grouped by the entity each source is about.",
    mandateKey: MANDATE_KEYS.research_client__output_competitive_landscape,
    bundleSlug: "research-competitive-landscape",
    outputKind: "competitive_landscape",
  },
  {
    // The research → map handoff (R8): a finished company topic-tree research
    // run (`content_topic_map` intent, or any research about the company) is
    // one of the six sources a topical map starts from. The run is the map
    // author's own durable entry, not the Context Builder, so the card opens
    // the brand-free start door with this research preselected.
    slug: "research-topical-map",
    label: "Topical map",
    description:
      "The brand's tree of subjects — every offering, audience and place it should cover — authored from this research by the topical map author, then reviewed in the map.",
    mandateKey: MANDATE_KEYS.seo__map_author,
    // The recipe the map author resolves SERVER-SIDE (aidream
    // research/context_bundles.py); named here so the Context Builder can show
    // exactly what the author reads. The card still opens the start door.
    bundleSlug: "research-topical-map",
    outputKind: "topical_map",
    openHref: (topicId) =>
      marketingRoutes.topicalMapStart({ researchTopicId: topicId, source: "existing_research" }),
  },
];

/** The card's destination: its own entry when it has one, else the Context Builder. */
export function domainOutputHref(def: DomainOutputDefinition, topicId: string): string {
  if (def.openHref) return def.openHref(topicId);
  if (def.bundleSlug) return contextBuilderHref(topicId, def.bundleSlug);
  throw new Error(
    `[research/outputs] "${def.slug}" declares neither a bundle nor an openHref — it has no run path.`,
  );
}

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
