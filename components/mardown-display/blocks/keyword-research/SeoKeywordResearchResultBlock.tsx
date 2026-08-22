"use client";

/**
 * SeoKeywordResearchResultBlock — THE renderer for
 * `seo_keyword_relationship_research_result`, the settled result of the
 * `seo.keywords.relationships.research` node.
 *
 * 🚨 **DELEGATE, NEVER REIMPLEMENT.** This kind is an ENVELOPE: the content is
 * `artifact` — a `keyword_relationship_research` instance, which already has
 * exactly one component platform-wide. Everything else in the payload is a
 * NUMBER ABOUT the run (keywords upserted, edges minted, volume rows fetched,
 * classifications updated). So the artifact goes straight back to the kind
 * registry through `DelegatedOutput` — the same transparent-router seam the
 * runtime wrappers use — and the counters sit under it as a quiet facts line.
 * The moment this file draws a keyword list itself, one shape has two
 * components and the layer model is dead.
 *
 * Why this exists at all: the artifact used to arrive stripped of its
 * `__kind`, so this result rendered as a raw JSON dump while the SAME data
 * coming from chat rendered through its real component. aidream now declares
 * the discriminator on the artifact (`KeywordResearchArtifact` is a
 * `KindModel`), which is what makes the delegation below possible.
 *
 * Bare by construction: the host (a readout step box, a chat message) already
 * draws chrome; this block adds no card of its own.
 */

import { DelegatedOutput } from "../runtime-wrappers/NodeOutcomeBlock";

export interface SeoKeywordResearchResultBlockProps {
  serverData?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** One "N label" fact, omitted entirely when the number isn't there. */
function Fact({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  return (
    <span className="whitespace-nowrap">
      <span className="font-medium text-foreground">
        {value.toLocaleString()}
      </span>{" "}
      {label}
    </span>
  );
}

export default function SeoKeywordResearchResultBlock({
  serverData,
}: SeoKeywordResearchResultBlockProps) {
  if (!isRecord(serverData)) return null;

  const artifact = serverData.artifact;
  const ingest = isRecord(serverData.ingest) ? serverData.ingest : null;
  const volume = isRecord(serverData.volume) ? serverData.volume : null;
  const classification = isRecord(serverData.classification)
    ? serverData.classification
    : null;

  const facts = [
    { value: count(ingest?.keywords_created), label: "keywords added" },
    { value: count(ingest?.keywords_already_existed), label: "already known" },
    { value: count(ingest?.edges_written), label: "relationships mapped" },
    { value: count(volume?.fetched_phrases), label: "with search volume" },
    { value: count(classification?.updated), label: "classified" },
  ].filter((fact) => fact.value !== null);

  return (
    <div className="space-y-2">
      <DelegatedOutput
        output={artifact}
        declaredKind="keyword_relationship_research"
      />
      {facts.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {facts.map((fact) => (
            <Fact key={fact.label} value={fact.value} label={fact.label} />
          ))}
        </div>
      )}
    </div>
  );
}
