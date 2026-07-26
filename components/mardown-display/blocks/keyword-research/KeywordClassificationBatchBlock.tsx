"use client";

/**
 * KeywordClassificationBatchBlock — renderer for the
 * `keyword_classification_batch_v1` kind. Streaming-first: each classified
 * keyword renders as a compact card the instant its object closes in the
 * stream — phrase, color-coded intent, the load-bearing facts as chips, and
 * a confidence meter. The batch header shows live progress; raw JSON never
 * reaches the user.
 *
 * Consumes the bridge serverData from
 * features/content-ir/kinds/keyword-research.ts. Also rendered directly
 * (outside chat) by the keyword-research workbench's live feed.
 */

import { AlertTriangle, Crosshair, Loader2 } from "lucide-react";
import type {
  KeywordClassificationBatchData,
  KeywordClassificationCardData,
  KeywordClassificationFactKey,
} from "@/features/content-ir/kinds/keyword-research";

export interface KeywordClassificationBatchBlockProps {
  serverData?: unknown;
}

function isCard(value: unknown): value is KeywordClassificationCardData {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as KeywordClassificationCardData).phrase === "string"
  );
}

export function readKeywordClassificationData(
  serverData: unknown,
): KeywordClassificationBatchData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<KeywordClassificationBatchData>;
  if (!Array.isArray(candidate.results)) return null;
  return {
    classifierVersion:
      typeof candidate.classifierVersion === "string"
        ? candidate.classifierVersion
        : null,
    results: candidate.results.filter(isCard),
    isComplete: candidate.isComplete === true,
  };
}

const INTENT_CHIP_CLASSES: Record<string, string> = {
  transactional: "border-primary/50 bg-primary/10 text-primary",
  commercial_investigation: "border-primary/30 bg-primary/5 text-foreground",
  informational: "border-border bg-muted text-muted-foreground",
  navigational: "border-border bg-muted text-muted-foreground",
};

/** Facts worth a chip on the compact card, beyond the intent headline. */
const CARD_FACT_KEYS: KeywordClassificationFactKey[] = [
  "funnel_stage",
  "audience_type",
  "specificity",
  "local_intent",
  "urgency",
  "comparison_intent",
  "price_sensitivity",
];

function humanize(value: string): string {
  return value.replace(/_/g, " ");
}

function ConfidenceMeter({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <span
      className="ml-auto inline-flex items-center gap-1.5"
      title={`Overall confidence ${clamped}%`}
    >
      <span className="h-1 w-10 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary/70"
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className="text-[10px] tabular-nums text-muted-foreground">
        {clamped}
      </span>
    </span>
  );
}

function ClassificationCard({
  card,
}: {
  card: KeywordClassificationCardData;
}) {
  const intent = card.facts.intent_class ?? null;
  return (
    <div className="animate-in fade-in rounded-lg border border-border bg-card p-2.5">
      <div className="flex items-center gap-2">
        <span className="truncate text-sm font-medium text-foreground">
          {card.phrase}
        </span>
        {!card.complete && (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
        )}
        {card.overallConfidence !== null && (
          <ConfidenceMeter value={card.overallConfidence} />
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {intent && (
          <span
            className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
              INTENT_CHIP_CLASSES[intent] ?? "border-border bg-muted text-muted-foreground"
            }`}
          >
            {humanize(intent)}
          </span>
        )}
        {CARD_FACT_KEYS.map((key) => {
          const fact = card.facts[key];
          return fact ? (
            <span
              key={key}
              className="rounded-full border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
              title={humanize(key)}
            >
              {humanize(fact)}
            </span>
          ) : null;
        })}
      </div>
      {card.secondaryInterpretation && (
        <p className="mt-1 text-[10px] text-muted-foreground">
          Alt read:{" "}
          {Object.entries(card.secondaryInterpretation)
            .map(([key, value]) => `${humanize(key)} → ${humanize(value)}`)
            .join(" · ")}
        </p>
      )}
      {card.error && (
        <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-destructive">
          <AlertTriangle className="h-3 w-3" />
          {card.error}
        </p>
      )}
    </div>
  );
}

export default function KeywordClassificationBatchBlock({
  serverData,
}: KeywordClassificationBatchBlockProps) {
  const data = readKeywordClassificationData(serverData);
  if (!data) return null;

  return (
    <div className="my-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Crosshair className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Keyword intent classification
        </span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {data.results.length}
        </span>
        {!data.isComplete && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Classifying
          </span>
        )}
        {data.classifierVersion && (
          <span className="ml-auto text-[10px] text-muted-foreground">
            {data.classifierVersion}
          </span>
        )}
      </div>
      <div className="grid gap-1.5 lg:grid-cols-2">
        {data.results.map((card, index) => (
          <ClassificationCard key={`${index}-${card.phrase}`} card={card} />
        ))}
        {data.results.length === 0 && (
          <span className="text-xs text-muted-foreground">
            Waiting for the first classification…
          </span>
        )}
      </div>
    </div>
  );
}
