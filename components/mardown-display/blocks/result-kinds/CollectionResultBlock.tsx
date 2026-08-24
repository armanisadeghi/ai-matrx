"use client";

/**
 * `collection_result` — the ONE renderer for the workflow COLLECTION kinds:
 * `items`, `page`, `string_list`, `split_result`, `filter_result`,
 * `sorted_list_result`, `flattened_list_result`, `batched_list_result`,
 * `gather_result`, `regex_extract_result`, `aggregate_result`,
 * `aggregate_group`, `tool_bundle_listing`.
 *
 * THE READER'S QUESTION: *how many came out — and what did I LOSE?*
 * Every kind in this family carries a count and a collection; what makes them
 * one family is that each also carries an honest record of the remainder,
 * under a different name each time: `dropped`, `skipped`, `skipped_indexes`,
 * `holes`, `skipped_unresolved`, `expected` (vs actual), `has_more`. The floor
 * shows those beside the payload as equal fields, which is exactly how a
 * silently-halved list gets shipped. Here the count is the headline and the
 * remainder is a red chip next to it.
 *
 * 🚨 NOT this family: `table_rows`, `parsed_table`, `sql_query_result`,
 * `saved_row`. They are the tabular run (data-to-kinds queue row 4), which
 * mints ONE typed-column table primitive that eight families nest. Rendering
 * them here would mint a competing table view days before that run lands.
 *
 * See `result-kind-shared.tsx` for the route contract and the Inventory Law
 * survey this component is bound by.
 */

import React from "react";
import { CircleX, Layers, List } from "lucide-react";

import { cn } from "@/lib/utils";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";
import { humanizeKey } from "@/features/tool-call-visualization/result-fields/shape";
import {
  ChipRow,
  CountChip,
  LeftoverFields,
  MetaStrip,
  RawRegion,
  Section,
  StateChip,
  StillArriving,
  isRecord,
  kindLabel,
  readBool,
  readKindValue,
  readNumber,
  readText,
  type ResultKindBlockProps,
} from "./result-kind-shared";

/** Collection field names, in the priority a family would carry one. */
const COLLECTION_KEYS = [
  "items",
  "values",
  "parts",
  "matches",
  "groups",
  "batches",
  "tools_loaded",
  "results",
  "files",
  "entries",
] as const;

/** The remainder — everything that did NOT make it into the collection. */
const LOSS_KEYS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "dropped", label: "dropped" },
  { key: "skipped", label: "skipped" },
  { key: "skipped_indexes", label: "skipped" },
  { key: "holes", label: "holes" },
  { key: "skipped_unresolved", label: "unresolved" },
];

/** Count-shaped context that is NOT a loss — size, sources, page geometry. */
const CONTEXT_KEYS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "kept", label: "kept" },
  { key: "sources", label: "sources" },
  { key: "size", label: "per batch" },
  { key: "total_items", label: "items total" },
];

/** A loss counter can be a number OR the length of the thing that was lost. */
function lossCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.length > 0 ? value.length : null;
  return null;
}

const CollectionResultBlock: React.FC<ResultKindBlockProps> = ({
  content,
  metadata,
  className,
}) => {
  const { value, recovered, kind, streaming } = readKindValue(content, metadata);
  if (!recovered || !isRecord(value)) {
    return <RawRegion content={content} className={className} />;
  }

  const collectionKey = COLLECTION_KEYS.find((key) => Array.isArray(value[key]));
  const collection = collectionKey ? (value[collectionKey] as unknown[]) : null;

  // The declared count is the TRUTH the producer stated; the array length is
  // what actually arrived. They disagree mid-stream and when a producer
  // truncates — say both rather than pick one.
  const declared = readNumber(value.count) ?? readNumber(value.total_items);
  const actual = collection?.length ?? null;
  const headlineCount = declared ?? actual;

  const archetype = readText(value.archetype);
  const noun =
    archetype ??
    (collectionKey ? humanizeKey(collectionKey).toLowerCase() : "results");

  const losses = LOSS_KEYS.map((loss) => ({
    ...loss,
    count: lossCount(value[loss.key]),
  })).filter((loss) => loss.count !== null && loss.count > 0);

  const context = CONTEXT_KEYS.map((item) => ({
    ...item,
    count: readNumber(value[item.key]),
  })).filter((item) => item.count !== null);

  const page = readNumber(value.page);
  const total = readNumber(value.total);
  const hasMore = readBool(value.has_more);
  const expected = readNumber(value.expected);
  const operation = readText(value.operation) ?? readText(value.bundle);

  const shown = [
    "count",
    "archetype",
    "total_items",
    "page",
    "total",
    "limit",
    "has_more",
    "expected",
    "operation",
    "bundle",
    ...LOSS_KEYS.map((loss) => loss.key),
    ...CONTEXT_KEYS.map((item) => item.key),
    ...(collectionKey ? [collectionKey] : []),
  ];

  return (
    <div className={cn("my-2 min-w-0 space-y-3", className)}>
      {streaming ? <StillArriving /> : null}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
          <List className="h-4 w-4 shrink-0 text-muted-foreground" />
          {headlineCount !== null ? (
            <>
              <span className="tabular-nums">{headlineCount.toLocaleString()}</span>
              <span className="font-normal text-muted-foreground">{noun}</span>
            </>
          ) : (
            (kindLabel(kind) || "Collection")
          )}
        </span>

        {operation ? <StateChip label={operation} tone="accent" /> : null}

        {/* The producer said N and N did not arrive — never let that pass as
            a rendering detail. */}
        {declared !== null && actual !== null && declared !== actual ? (
          <StateChip
            label={`${actual.toLocaleString()} shown`}
            tone={streaming ? "neutral" : "warn"}
          />
        ) : null}
        {expected !== null && headlineCount !== null && expected !== headlineCount ? (
          <StateChip label={`${expected.toLocaleString()} expected`} tone="warn" />
        ) : null}
      </div>

      {losses.length > 0 || context.length > 0 || page !== null || hasMore !== null ? (
        <ChipRow>
          {losses.map((loss) => (
            <CountChip
              key={loss.key}
              value={loss.count as number}
              label={loss.label}
              tone="bad"
              icon={<CircleX className="h-3.5 w-3.5 shrink-0" />}
            />
          ))}
          {context.map((item) => (
            <CountChip
              key={item.key}
              value={item.count as number}
              label={item.label}
              tone="neutral"
              icon={
                item.key === "size" ? (
                  <Layers className="h-3.5 w-3.5 shrink-0" />
                ) : undefined
              }
            />
          ))}
          {page !== null ? (
            <StateChip
              label={
                total !== null
                  ? `page ${page.toLocaleString()} of ${total.toLocaleString()}`
                  : `page ${page.toLocaleString()}`
              }
              tone="accent"
            />
          ) : null}
          {hasMore === true ? <StateChip label="more available" tone="accent" /> : null}
        </ChipRow>
      ) : null}

      {collection && collection.length > 0 ? (
        <Section label={humanizeKey(collectionKey as string)}>
          {/* Uniform rows become a real table; ragged ones become titled
              sections — both from the platform's existing value renderer. */}
          <ResultValue value={collection} density="full" />
        </Section>
      ) : null}

      {/* `aggregate_result` / `aggregate_group` carry a computed RESULT beside
          their groups, and it is the answer the reader asked for. */}
      {value.result !== undefined && value.result !== null ? (
        <Section label="Result">
          <ResultValue value={value.result} density="full" />
        </Section>
      ) : null}
      {value.first !== undefined && value.first !== null ? (
        <Section label="First match">
          <ResultValue value={value.first} density="full" />
        </Section>
      ) : null}
      {/* `aggregate_group.key` is the thing the group is grouped BY, and it is
          typed `any` — a scalar most of the time, an object when the grouping
          is composite. The meta strip only carries scalars, so it gets its own
          section rather than a chance to vanish. */}
      {value.key !== undefined && value.key !== null ? (
        <Section label="Grouped by">
          <ResultValue value={value.key} density="full" />
        </Section>
      ) : null}

      <MetaStrip value={value} omit={[...shown, "result", "first", "key"]} />
      <LeftoverFields value={value} omit={[...shown, "result", "first", "key"]} />
    </div>
  );
};

export default CollectionResultBlock;
