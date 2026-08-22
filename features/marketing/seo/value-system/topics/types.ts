/**
 * Topic Tree Builder — types + the ROOT-TYPE vocabulary in business language.
 *
 * The root type is the whole point of the tree. `seo.keyword_value_map` walks
 * a keyword's primary topic upward and reports the TOPMOST ancestor's
 * `node_type` as the keyword's `root`. That one word answers Arman's question:
 * can this traffic ever become money, or is it only ever authority?
 */

export interface TopicStatRow {
  topic_id: string;
  value_band: string;
  keywords: number;
  clicks: number;
  impressions: number;
}

export interface OfferingSplitRow {
  bucket: "offering" | "authority" | "unassigned";
  root_type: string;
  keywords: number;
  clicks: number;
  impressions: number;
}

export interface UnassignedKeywordRow {
  keyword_id: string;
  phrase: string;
  clicks: number;
  impressions: number;
  value_band: string;
  total_count: number;
}

export interface KeywordTopicResult {
  keyword_id: string;
  value_band: string;
  value_source: string;
  value_score: number | null;
}

/**
 * THE MISMATCH RULE (USER.md): the person choosing this is a subject-matter
 * expert in their business, not in SEO taxonomy. So every option is written as
 * a sentence about their money, never as a schema label.
 */
export interface RootTypeMeta {
  value: string;
  label: string;
  /** What choosing this MEANS for the money. */
  meaning: string;
  /** True when traffic under this root can become a customer. */
  offering: boolean;
}

export const ROOT_TYPE_META: RootTypeMeta[] = [
  {
    value: "service",
    label: "A service you sell",
    meaning: "Traffic under here can become a paying customer.",
    offering: true,
  },
  {
    value: "product",
    label: "A product you sell",
    meaning: "Traffic under here can become a paying customer.",
    offering: true,
  },
  {
    value: "problem",
    label: "A problem you get paid to solve",
    meaning:
      "Someone searching their problem is shopping for your answer — this can become money.",
    offering: true,
  },
  {
    value: "audience",
    label: "A group of people you sell to",
    meaning: "The searcher is the kind of buyer you want — this can become money.",
    offering: true,
  },
  {
    value: "brand",
    label: "Your name or your brand",
    meaning: "People looking for you by name — the closest traffic to a sale there is.",
    offering: true,
  },
  {
    value: "authority",
    label: "Authority only — it will never sell anything",
    meaning:
      "Real traffic that builds your site's standing, and nothing more. An SEO company growing only this is not growing your revenue.",
    offering: false,
  },
  {
    value: "existing_customer",
    label: "People who already bought from you",
    meaning:
      "Support and account traffic. Worth serving well, never counted as new business.",
    offering: false,
  },
  {
    value: "recruiting",
    label: "People looking for a job",
    meaning: "Useful for hiring. It is not customer demand.",
    offering: false,
  },
  {
    value: "reputation",
    label: "People checking you out",
    meaning:
      "Reviews, complaints, is-this-legit searches. Reputation work, not acquisition.",
    offering: false,
  },
  {
    value: "partner",
    label: "Partners, vendors, and suppliers",
    meaning: "Business-to-business relationships, not buyers.",
    offering: false,
  },
];

export function rootTypeMeta(nodeType: string | null | undefined): RootTypeMeta {
  return (
    ROOT_TYPE_META.find((meta) => meta.value === nodeType) ?? {
      value: nodeType ?? "unknown",
      label: nodeType ?? "Not set",
      meaning: "This type is not in the vocabulary — the tree cannot say what it is worth.",
      offering: false,
    }
  );
}

/** `seo.site_topic_value.lead_quality` — the site's own words for it. */
export const LEAD_QUALITY_OPTIONS = [
  { value: "high_value", label: "The leads we want most" },
  { value: "medium_value", label: "Decent leads" },
  { value: "low_value", label: "Weak leads" },
  {
    value: "negative_value",
    label: "Leads we do not want",
    guard: true,
  },
] as const;

/** `seo.site_topic_value.service_match`. */
export const SERVICE_MATCH_OPTIONS = [
  { value: "core_service", label: "This is what we do" },
  { value: "adjacent_service", label: "Near what we do" },
  { value: "not_offered", label: "We do not offer this", guard: true },
  { value: "actively_avoided", label: "We turn this work away", guard: true },
] as const;

/** The two rulings that force a keyword's band to Negative regardless of arithmetic. */
export function isNegativeGuard(
  leadQuality: string | null,
  serviceMatch: string | null,
): boolean {
  return (
    leadQuality === "negative_value" ||
    serviceMatch === "not_offered" ||
    serviceMatch === "actively_avoided"
  );
}
