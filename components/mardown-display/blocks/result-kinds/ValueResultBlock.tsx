"use client";

/**
 * `value_result` — the ONE renderer for the SINGLE-VALUE kinds: `text`,
 * `value`, `json`, `number`, `boolean`, `rendered_text`, `slug_result`,
 * `random_string_result`, `uuid_value`, `hash_result`, `regex_replace_result`,
 * `template_render_result`, `field_lookup_result`, `json_path_result`,
 * `custom_script_result`, `record_result`, `human_text_answer`,
 * `word_count_result`, `text_quality_check_result`, `formatted_datetime`,
 * `parsed_datetime`, `shifted_datetime`, `datetime_snapshot`.
 *
 * THE READER'S QUESTION: *what is the value?*
 * These steps produce ONE thing and a little provenance about how. On the
 * floor the value and its provenance render as sibling rows of a field grid,
 * so "the slug" and "the algorithm that made it" look equally important. Here
 * the value is the page — large, selectable, copyable — and the provenance is
 * a meta line beneath it.
 *
 * Three sub-shapes earn their own headline, because for them the value alone
 * would lie:
 *  - **a lookup** (`found: false`) — an absent value is a RESULT, not an empty
 *    render, so "not found" is stated outright;
 *  - **a check** (`passed`) — the verdict leads and the counts follow;
 *  - **an instant** (`iso`) — a machine timestamp is unreadable, so the human
 *    date leads and the ISO string stays available to copy.
 *
 * See `result-kind-shared.tsx` for the route contract and the Inventory Law
 * survey this component is bound by.
 */

import React from "react";
import { CalendarClock, CircleCheck, CircleSlash, CircleX } from "lucide-react";

import { cn } from "@/lib/utils";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";
import { humanizeKey } from "@/features/tool-call-visualization/result-fields/shape";
import {
  formatAbsoluteDate,
  formatRelativeTime,
} from "@/utils/datetime";
import {
  ChipRow,
  CopyValueButton,
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

/** Where THE value lives, in the priority these kinds carry one. */
const VALUE_KEYS = [
  "text",
  "value",
  "slug",
  "digest",
  "uuid",
  "result",
  "answer",
] as const;

/** `word_count_result` and friends are all counters and no value. */
const STAT_KEYS: ReadonlyArray<string> = [
  "words",
  "characters",
  "characters_no_spaces",
  "sentences",
  "paragraphs",
  "lines",
  "chars",
  "replacements",
  "rendered",
];

/** Above this, a string is a document and belongs to the value renderer. */
const INLINE_VALUE_MAX = 160;

/** A short single-line scalar — the thing a reader copies. */
const HeroScalar: React.FC<{ text: string; what: string }> = ({ text, what }) => (
  <div className="flex min-w-0 items-center gap-1.5">
    <span className="min-w-0 break-all font-mono text-base font-medium text-foreground">
      {text}
    </span>
    <CopyValueButton text={text} what={what} />
  </div>
);

const ValueResultBlock: React.FC<ResultKindBlockProps> = ({
  content,
  metadata,
  className,
}) => {
  const { value, recovered, kind, streaming } = readKindValue(content, metadata);
  if (!recovered) {
    return <RawRegion content={content} className={className} />;
  }

  // `json`, `number`, and `boolean` register a BARE value — the payload is the
  // scalar itself, not an object wrapping one. Hand it straight to the value
  // renderer rather than pretending it has fields.
  if (!isRecord(value)) {
    return (
      <div className={cn("my-2 min-w-0 space-y-2", className)}>
        {streaming ? <StillArriving /> : null}
        <ResultValue value={value} density="full" />
      </div>
    );
  }

  const found = readBool(value.found);
  const passed = readBool(value.passed);
  const reason = readText(value.reason);
  const iso = readText(value.iso);
  const missingKeys = Array.isArray(value.missing_keys)
    ? value.missing_keys.filter((item): item is string => typeof item === "string")
    : [];
  const truncated = readBool(value.truncated) === true;

  const valueKey = VALUE_KEYS.find(
    (key) => value[key] !== undefined && value[key] !== null,
  );
  const rawValue = valueKey ? value[valueKey] : undefined;
  const valueText = readText(rawValue);
  const isInlineScalar =
    valueText !== null &&
    valueText.length <= INLINE_VALUE_MAX &&
    !valueText.includes("\n");

  const stats = STAT_KEYS.map((key) => ({ key, count: readNumber(value[key]) })).filter(
    (stat) => stat.count !== null,
  );

  const shown = [
    ...(valueKey ? [valueKey] : []),
    ...STAT_KEYS,
    "found",
    "passed",
    "reason",
    "iso",
    "missing_keys",
    "truncated",
  ];

  // A datetime kind leads with the human instant; the ISO string stays
  // copyable because that is what a reader pastes into the next step.
  const isDatetime = iso !== null;

  return (
    <div className={cn("my-2 min-w-0 space-y-3", className)}>
      {streaming ? <StillArriving /> : null}

      {/* The verdicts — stated before the value, because each one changes what
          the value MEANS. */}
      {found === false || passed !== null ? (
        <ChipRow>
          {found === false ? (
            <StateChip
              label="not found"
              tone="warn"
              icon={<CircleSlash className="h-3.5 w-3.5 shrink-0" />}
            />
          ) : null}
          {found === true ? <StateChip label="found" tone="good" /> : null}
          {passed !== null ? (
            <StateChip
              label={passed ? "passed" : reason ? `failed — ${reason}` : "failed"}
              tone={passed ? "good" : "bad"}
              icon={
                passed ? (
                  <CircleCheck className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <CircleX className="h-3.5 w-3.5 shrink-0" />
                )
              }
            />
          ) : null}
        </ChipRow>
      ) : null}

      {isDatetime ? (
        <div className="min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-base font-medium text-foreground">
              {formatAbsoluteDate(iso, undefined, iso)}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatRelativeTime(iso, { style: "long", fallback: "" })}
            </span>
            <CopyValueButton text={iso} what="timestamp" />
          </div>
          {valueText && valueText !== iso ? (
            <div className="break-words font-mono text-sm text-foreground">
              {valueText}
            </div>
          ) : null}
        </div>
      ) : isInlineScalar ? (
        <HeroScalar
          text={valueText as string}
          what={humanizeKey(valueKey as string).toLowerCase()}
        />
      ) : rawValue !== undefined ? (
        <Section
          label={humanizeKey(valueKey as string)}
          trailing={
            valueText ? <CopyValueButton text={valueText} what="value" /> : undefined
          }
        >
          <ResultValue value={rawValue} density="full" />
        </Section>
      ) : stats.length === 0 ? (
        // No value and no counters — say which kind produced nothing rather
        // than render an empty box.
        <div className="text-sm text-muted-foreground">
          {kindLabel(kind) || "This step"} returned no value.
        </div>
      ) : null}

      {stats.length > 0 ? (
        <ChipRow>
          {stats.map((stat) => (
            <CountChip
              key={stat.key}
              value={stat.count as number}
              label={humanizeKey(stat.key).toLowerCase()}
            />
          ))}
        </ChipRow>
      ) : null}

      {/* A template that rendered with holes in it is a defect the reader must
          see — it is the one thing `template_render_result` exists to report. */}
      {missingKeys.length > 0 ? (
        <ChipRow>
          <StateChip
            label={`${missingKeys.length} unfilled: ${missingKeys.join(", ")}`}
            tone="warn"
          />
        </ChipRow>
      ) : null}
      {truncated ? (
        <ChipRow>
          <StateChip label="truncated" tone="warn" />
        </ChipRow>
      ) : null}

      <MetaStrip value={value} omit={shown} />
      <LeftoverFields value={value} omit={shown} />
    </div>
  );
};

export default ValueResultBlock;
