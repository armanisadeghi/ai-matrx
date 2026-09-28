/**
 * report-output-offer-values.ts — the REAL facts the Outputs Studio holds for
 * its blog / slides / SEO generators, named exactly as the
 * `research_client.report_output` provision declares them (aidream
 * `services/mandates/client_mandates.py`).
 *
 * Mapped-only offers (pass_by_name=False): the mandate door drops them unless
 * a binding's consumption map names them (the live `output_slides` default
 * map names only `report_markdown` + `voice_lens`), so sending them never
 * changes what a current Holder receives. Absent facts are omitted — never
 * sent as "" or null.
 */

import type { ResearchClientReportOutputOffer } from "@/types/python-generated/provision-offers";
import type { ResearchTopic } from "../../types";

export type ReportOutputFacts = Partial<
  Pick<
    ResearchClientReportOutputOffer,
    | "topic_name"
    | "topic_description"
    | "intent_brief"
    | "intent_key"
    | "existing_output_titles"
    | "report_source"
  >
>;

/** Where the studio's report text actually came from. */
export type ReportSource =
  | "resource_bundle"
  | "research_document"
  | "topic_synthesis";

const text = (value: string | null | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

export function reportOutputOfferValues(
  topic:
    | Pick<ResearchTopic, "name" | "description" | "intent_brief" | "intent_key">
    | null
    | undefined,
  reportSource: ReportSource | null,
  existingTitles: readonly string[],
): ReportOutputFacts {
  const titles = existingTitles.map((title) => title.trim()).filter(Boolean);
  const facts = {
    topic_name: text(topic?.name),
    topic_description: text(topic?.description),
    intent_brief: text(topic?.intent_brief),
    intent_key: text(topic?.intent_key),
    existing_output_titles: titles.length > 0 ? titles : undefined,
    report_source: reportSource ?? undefined,
  } satisfies ReportOutputFacts;
  const out: ReportOutputFacts = {};
  for (const [key, value] of Object.entries(facts)) {
    if (value !== undefined) Object.assign(out, { [key]: value });
  }
  return out;
}
