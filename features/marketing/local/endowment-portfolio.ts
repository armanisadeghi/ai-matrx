/**
 * The Endowment Portfolio — the structured companion to the markdown Endowment
 * Analyst, and the seam where an analysis stops being prose and becomes WORK.
 *
 * Doctrine: `../../../../common-docs/systems/marketing/local-listings/ENDOWMENTS.md`
 * Registry intake contract (WS7): `../../../../common-docs/systems/marketing/local-listings/PLAN.md`
 *
 * Everything in this file is PURE — coercion of the agent's JSON, domain/slug
 * normalization, the registry dedup decision, and the shapes handed to the
 * registry writer and the task queue. The IO lives in
 * `features/marketing/data/service.ts` (registry) and
 * `features/tasks/services/taskService.ts` (artifact queue); the UI lives in
 * `EndowmentPortfolioPanel.tsx`. Tests: `endowment-portfolio.test.ts`.
 */

import type { Database } from "@/types/database.types";
import type { ListingPublisher } from "@/features/marketing/types";
import {
  PUBLISHER_API_ACCESS,
  PUBLISHER_TIERS,
  type PublisherApiAccess,
  type PublisherTier,
} from "@/features/marketing/types";

/** Mandate keys — which agent runs is DB-bound, never coded here. */
export const ENDOWMENT_ANALYSIS_MANDATE = "marketing.endowment_analysis";
export const ENDOWMENT_PORTFOLIO_MANDATE = "marketing.endowment_portfolio";

export const ENDOWMENTS = [
  "data",
  "expertise",
  "media",
  "process",
  "people",
  "place",
  "capital",
  "demand",
  "code",
] as const;
export type Endowment = (typeof ENDOWMENTS)[number];

export const ENDOWMENT_LABELS: Record<Endowment, string> = {
  data: "Data",
  expertise: "Expertise",
  media: "Media",
  process: "Process",
  people: "People",
  place: "Place",
  capital: "Capital",
  demand: "Demand",
  code: "Code",
};

export const ENDOWMENT_QUESTIONS: Record<Endowment, string> = {
  data: "What do your operations count?",
  expertise: "What could you teach in an hour?",
  media: "What do you see that others photograph badly?",
  process: "What spreadsheet or checklist runs your business?",
  people: "Who here has an opinion worth quoting?",
  place: "What do you know about where you physically are?",
  capital: "What could you fund for $500–5,000/year?",
  demand: "Who are you hiring or training?",
  code: "What internal tool solves a niche problem?",
};

export const ENDOWMENT_VERDICTS = ["strong", "moderate", "weak"] as const;
export type EndowmentVerdict = (typeof ENDOWMENT_VERDICTS)[number];

export const REFERENCE_CLASSES = [
  "doi_citation",
  "directory_listing",
  "editorial_mention",
  "template_share",
  "edu_gov_listing",
  "marketplace_listing",
  "wiki_adoption",
] as const;
export type ReferenceClass = (typeof REFERENCE_CLASSES)[number];

export const REFERENCE_CLASS_LABELS: Record<ReferenceClass, string> = {
  doi_citation: "DOI citations",
  directory_listing: "Directory listing",
  editorial_mention: "Editorial mention",
  template_share: "Template shares",
  edu_gov_listing: ".edu / .gov listing",
  marketplace_listing: "Marketplace listing",
  wiki_adoption: "Wiki adoption",
};

export const TIER3_ARCHETYPES = [
  "award",
  "certification",
  "index_report",
  "directory",
] as const;
export type Tier3Archetype = (typeof TIER3_ARCHETYPES)[number];

export const TIER3_ARCHETYPE_LABELS: Record<Tier3Archetype, string> = {
  award: "Award program",
  certification: "Certification / badge",
  index_report: "Index report",
  directory: "Directory",
};

export interface EndowmentVerdictEntry {
  endowment: Endowment;
  verdict: EndowmentVerdict;
  rationale: string;
}

export interface PortfolioArtifact {
  title: string;
  endowment: Endowment;
  description: string;
  effort_hours: number;
  reference_class: ReferenceClass;
  target_platforms: string[];
}

export interface PortfolioPlatform {
  name: string;
  domain: string;
  suggested_slug: string;
  tier: PublisherTier;
  categories: string[];
  api_access_guess: PublisherApiAccess;
  signup_url: string | null;
  notes: string;
  endowment: Endowment;
}

export interface Tier3Concept {
  name: string;
  archetype: Tier3Archetype;
  criteria_axis: string;
  who_would_link: string;
}

export interface EndowmentPortfolio {
  business_read: string;
  endowments: EndowmentVerdictEntry[];
  artifacts: PortfolioArtifact[];
  platforms: PortfolioPlatform[];
  tier3_concepts: Tier3Concept[];
  what_not_to_do: string[];
}

// ── Normalization ────────────────────────────────────────────────────────────

/**
 * A bare, comparable registrable host: no scheme, no credentials, no `www.`,
 * no port, no path, no trailing dot. This is the ONLY function that decides
 * whether two registry rows are "the same site", so the dedup and the write
 * both go through it — a domain normalized two ways would let the same
 * publisher land twice under two slugs, which WS7 forbids.
 */
export function normalizeDomain(raw: string): string {
  let value = (raw ?? "").trim().toLowerCase();
  if (!value) return "";
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  value = value.replace(/^[^/@]*@/, ""); // user:pass@
  value = value.split(/[/?#]/)[0] ?? "";
  value = value.replace(/:\d+$/, "");
  value = value.replace(/\.+$/, "");
  value = value.replace(/^www\./, "");
  return value;
}

/** kebab-case, ASCII, collapsed — the registry's `slug` shape. */
export function normalizeSlug(raw: string): string {
  return (raw ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** The slug a platform should claim: its own, or one derived from its name. */
export function platformSlug(platform: PortfolioPlatform): string {
  return (
    normalizeSlug(platform.suggested_slug) ||
    normalizeSlug(platform.name) ||
    normalizeSlug(platform.domain)
  );
}

// ── Coercion ─────────────────────────────────────────────────────────────────

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = str(item);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  const text = str(value).toLowerCase();
  return (allowed as readonly string[]).includes(text) ? (text as T) : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/**
 * Narrow the agent's JSON to the portfolio shape.
 *
 * The provider enforces the schema, so this is a boundary guard, not a parser:
 * it drops entries with no identity (an artifact with no title, a platform with
 * no domain) rather than rendering an unclickable row, and THROWS only when the
 * payload carries nothing actionable at all — the surface has nothing to show
 * and the operator deserves to be told, not shown an empty panel.
 */
export function coerceEndowmentPortfolio(value: unknown): EndowmentPortfolio {
  if (!isRecord(value)) {
    throw new Error("The portfolio builder returned no structured portfolio.");
  }

  const endowments: EndowmentVerdictEntry[] = [];
  const seenEndowments = new Set<Endowment>();
  for (const entry of records(value.endowments)) {
    const endowment = str(entry.endowment).toLowerCase() as Endowment;
    if (!ENDOWMENTS.includes(endowment) || seenEndowments.has(endowment)) continue;
    seenEndowments.add(endowment);
    endowments.push({
      endowment,
      verdict: oneOf(entry.verdict, ENDOWMENT_VERDICTS, "moderate"),
      rationale: str(entry.rationale),
    });
  }
  // Canonical order, always — the doctrine reads code LAST for a reason.
  endowments.sort(
    (a, b) => ENDOWMENTS.indexOf(a.endowment) - ENDOWMENTS.indexOf(b.endowment),
  );

  const artifacts: PortfolioArtifact[] = [];
  for (const entry of records(value.artifacts)) {
    const title = str(entry.title);
    if (!title) continue;
    const hours = Number(entry.effort_hours);
    artifacts.push({
      title,
      endowment: oneOf(entry.endowment, ENDOWMENTS, "expertise"),
      description: str(entry.description),
      effort_hours: Number.isFinite(hours) && hours >= 0 ? hours : 0,
      reference_class: oneOf(
        entry.reference_class,
        REFERENCE_CLASSES,
        "directory_listing",
      ),
      target_platforms: strList(entry.target_platforms),
    });
  }

  const platforms: PortfolioPlatform[] = [];
  const seenSlugs = new Set<string>();
  const seenDomains = new Set<string>();
  for (const entry of records(value.platforms)) {
    const domain = normalizeDomain(str(entry.domain));
    const name = str(entry.name);
    if (!domain || !name) continue;
    const candidate: PortfolioPlatform = {
      name,
      domain,
      suggested_slug: "",
      tier: oneOf(entry.tier, PUBLISHER_TIERS, "vertical"),
      categories: strList(entry.categories).map((item) => normalizeSlug(item)).filter(Boolean),
      api_access_guess: oneOf(entry.api_access_guess, PUBLISHER_API_ACCESS, "none"),
      signup_url: str(entry.signup_url) || null,
      notes: str(entry.notes),
      endowment: oneOf(entry.endowment, ENDOWMENTS, "expertise"),
    };
    candidate.suggested_slug = platformSlug({
      ...candidate,
      suggested_slug: str(entry.suggested_slug),
    });
    if (!candidate.suggested_slug) continue;
    // One agent run must never propose the same property twice — its own
    // duplicates would race each other into the registry.
    if (seenSlugs.has(candidate.suggested_slug) || seenDomains.has(candidate.domain)) {
      continue;
    }
    seenSlugs.add(candidate.suggested_slug);
    seenDomains.add(candidate.domain);
    platforms.push(candidate);
  }

  const tier3: Tier3Concept[] = [];
  for (const entry of records(value.tier3_concepts)) {
    const name = str(entry.name);
    if (!name) continue;
    tier3.push({
      name,
      archetype: oneOf(entry.archetype, TIER3_ARCHETYPES, "directory"),
      criteria_axis: str(entry.criteria_axis),
      who_would_link: str(entry.who_would_link),
    });
  }

  if (artifacts.length === 0 && platforms.length === 0) {
    throw new Error(
      "The portfolio builder returned no artifacts and no platforms — nothing to act on.",
    );
  }

  return {
    business_read: str(value.business_read),
    endowments,
    artifacts,
    platforms,
    tier3_concepts: tier3,
    what_not_to_do: strList(value.what_not_to_do),
  };
}

// ── Registry intake (PLAN.md WS7) ────────────────────────────────────────────

export type PublisherInsert = Database["web"]["Tables"]["listing_publisher"]["Insert"];

/**
 * Sort rank per WS7: 400+ for verticals, 460+ for the long tail. Agent-discovered
 * rows land BELOW the hand-curated registry so a discovery sweep can never
 * reorder the critical publishers out of the top of the matrix.
 */
const TIER_SORT_RANK: Record<PublisherTier, number> = {
  critical: 420,
  aggregator: 430,
  high_value: 440,
  vertical: 450,
  long_tail: 470,
};

/** Citation weight seed by tier — a starting value an operator can retune. */
const TIER_CITATION_WEIGHT: Record<PublisherTier, number> = {
  critical: 70,
  aggregator: 65,
  high_value: 55,
  vertical: 45,
  long_tail: 25,
};

export interface DiscoveredPublisherInput {
  slug: string;
  name: string;
  domain: string;
  tier: PublisherTier;
  categories: string[];
  apiAccess: PublisherApiAccess;
  apiNotes: string;
  manageUrl: string | null;
  citationWeight: number;
  sortRank: number;
  /** Provenance for the registry row — which endowment surfaced it, and how. */
  metadata: {
    discovered_by: "marketing.endowment_portfolio";
    endowment: Endowment;
    brand_id: string;
  };
}

/**
 * The WS7 intake payload for one discovered platform. `api_notes` is the
 * submission-recipe seed WS4's browser agents consume, so the agent's "how to
 * get in" prose is carried through verbatim rather than summarized away.
 */
export function toDiscoveredPublisher(
  platform: PortfolioPlatform,
  brandId: string,
): DiscoveredPublisherInput {
  const notes = [platform.notes.trim(), platform.signup_url ? `Signup: ${platform.signup_url}` : ""]
    .filter(Boolean)
    .join("\n\n");
  return {
    slug: platformSlug(platform),
    name: platform.name,
    domain: platform.domain,
    tier: platform.tier,
    categories: platform.categories,
    apiAccess: platform.api_access_guess,
    apiNotes: notes,
    manageUrl: platform.signup_url,
    citationWeight: TIER_CITATION_WEIGHT[platform.tier],
    sortRank: TIER_SORT_RANK[platform.tier],
    metadata: {
      discovered_by: "marketing.endowment_portfolio",
      endowment: platform.endowment,
      brand_id: brandId,
    },
  };
}

export type RegistryMatchReason = "domain" | "slug";

export interface RegistryMatch {
  platform: PortfolioPlatform;
  /** The registry row this platform already IS, if any. */
  existing: ListingPublisher | null;
  /** Why it matched — domain first, because WS7 dedups on the domain. */
  matchedBy: RegistryMatchReason | null;
}

/**
 * Decide, for every proposed platform, whether the registry already tracks it.
 *
 * THE WS7 DEDUP RULE: never insert a domain twice under two slugs. Domain wins
 * over slug because two agents naming the same site ("wikimedia-commons" vs
 * "commons-wikimedia") produce different slugs for one property, and the
 * domain is the thing that is actually unique.
 *
 * `existing` MUST come from a complete read of the registry (`readAllRows`) —
 * a truncated list turns "already tracked" into a confident duplicate insert.
 */
export function matchPlatformsToRegistry(
  platforms: PortfolioPlatform[],
  existing: ListingPublisher[],
): RegistryMatch[] {
  const byDomain = new Map<string, ListingPublisher>();
  const bySlug = new Map<string, ListingPublisher>();
  for (const row of existing) {
    const domain = normalizeDomain(row.domain ?? "");
    if (domain && !byDomain.has(domain)) byDomain.set(domain, row);
    const slug = normalizeSlug(row.slug ?? "");
    if (slug && !bySlug.has(slug)) bySlug.set(slug, row);
  }
  return platforms.map((platform) => {
    const domainHit = byDomain.get(platform.domain);
    if (domainHit) return { platform, existing: domainHit, matchedBy: "domain" };
    const slugHit = bySlug.get(platformSlug(platform));
    if (slugHit) return { platform, existing: slugHit, matchedBy: "slug" };
    return { platform, existing: null, matchedBy: null };
  });
}

// ── Artifact queue ───────────────────────────────────────────────────────────

/**
 * Stable identity for an artifact task: the same artifact accepted twice (a
 * re-run, a second operator, a reload) resolves to the SAME task instead of a
 * duplicate. Keyed on the brand + the artifact title, because the title is what
 * the operator recognizes and what a re-run reproduces.
 */
export function artifactTaskDedupeKey(
  brandId: string,
  artifact: PortfolioArtifact,
): string {
  return `endowment:${brandId}:${normalizeSlug(artifact.title) || "artifact"}`;
}

export interface ArtifactTaskInput {
  dedupeKey: string;
  title: string;
  description: string;
  sourceType: "marketing_brand";
  sourceId: string;
  sourceUrl: string;
  sourceLabel: string;
  priority: "low" | "medium" | "high";
  metadata: {
    endowment: Endowment;
    reference_class: ReferenceClass;
    effort_hours: number;
    target_platforms: string[];
    mandate_key: string;
  };
}

/**
 * Effort → priority. Cheap artifacts that propagate widely are the whole point
 * of the model (rank by propagation value ÷ production cost), so the near-free
 * ones surface first in the operator's task list.
 */
export function artifactPriority(
  artifact: PortfolioArtifact,
): "low" | "medium" | "high" {
  if (artifact.effort_hours <= 4) return "high";
  if (artifact.effort_hours <= 16) return "medium";
  return "low";
}

/** The task an accepted artifact becomes — linked back to the brand it is for. */
export function toArtifactTask(
  artifact: PortfolioArtifact,
  context: { brandId: string; brandLabel: string; surfaceUrl: string },
): ArtifactTaskInput {
  const platforms = artifact.target_platforms.length
    ? `\n\nTarget platforms: ${artifact.target_platforms.join(", ")}`
    : "";
  const description =
    `${artifact.description}\n\n` +
    `Endowment: ${ENDOWMENT_LABELS[artifact.endowment]} — ${ENDOWMENT_QUESTIONS[artifact.endowment]}\n` +
    `Expected reference class: ${REFERENCE_CLASS_LABELS[artifact.reference_class]}\n` +
    `Estimated effort: ${artifact.effort_hours} hour${artifact.effort_hours === 1 ? "" : "s"}` +
    platforms;
  return {
    dedupeKey: artifactTaskDedupeKey(context.brandId, artifact),
    title: artifact.title,
    description: description.trim(),
    sourceType: "marketing_brand",
    sourceId: context.brandId,
    sourceUrl: context.surfaceUrl,
    sourceLabel: `Endowment portfolio — ${context.brandLabel}`,
    priority: artifactPriority(artifact),
    metadata: {
      endowment: artifact.endowment,
      reference_class: artifact.reference_class,
      effort_hours: artifact.effort_hours,
      target_platforms: artifact.target_platforms,
      mandate_key: ENDOWMENT_PORTFOLIO_MANDATE,
    },
  };
}
