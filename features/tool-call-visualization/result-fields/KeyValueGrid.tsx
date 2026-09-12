"use client";

/**
 * KeyValueGrid — renders a plain object as a compact, shape-aware field layout.
 *
 * Fields are partitioned by what their VALUE is, not treated uniformly:
 *
 *   inline  — short values (scalar / uuid / url / boolean / empty) render as
 *             single-line `Label  value` rows on a two-column grid. Key, Type,
 *             Label never burn two lines each again.
 *   chips   — numeric metadata (total_chars, count, duration_ms, tokens…)
 *             renders as one wrapping row of quiet badges.
 *   blocks  — anything of unknown length (text, markdown, nested objects,
 *             tables, lists, media) keeps a full-width section: small label
 *             header, value beneath, recursing through {@link ResultValue}.
 *
 * Display order is inline rows → chips → blocks so unknown-length content
 * always sits last. Identifier keys (`id`, `*_id`, `uuid`) render the full
 * UUID with an always-visible copy button.
 *
 * Every key is reachable: nothing is dropped, only deferred behind a toggle.
 */

import React from "react";
import { cn } from "@/lib/utils";
import {
  detectResultShape,
  humanizeEnumValue,
  humanizeKey,
  looksLikeUuid,
  mediaElementHintForKey,
} from "./shape";
import { ResultValue, type ResultDensity } from "./ResultValue";
import { ShortId } from "./ShortId";

export interface KeyValueGridProps {
  value: Record<string, unknown>;
  density?: ResultDensity;
  depth?: number;
  /** Propagated to every field — see `ResultValueProps.embedMedia`. */
  embedMedia?: boolean;
  className?: string;
}

/** Inline cap on the number of object entries shown before "+N more". */
const INLINE_ENTRY_CAP = 8;

/**
 * KEYS THAT NAME A MACHINE IDENTIFIER — never the reader's answer.
 *
 * The parenting-benchmark judge (2026-09-12) caught raw rule-id slugs
 * (`bedtime-and-bath-schedule`) printed on a screen written for a parent. The
 * floor already knew `rule_id` was an identifier; it only ACTED on that when
 * the VALUE looked like a UUID, so a human-authored slug walked straight
 * through as an ordinary field. An identifier is identified by its KEY —
 * what the value happens to look like decides nothing.
 */
const IDENTIFIER_KEY =
  /^(id|uuid|guid|slug|_id|.*_id|.*_uuid|.*_slug|.*_key|.*Id|.*Uuid|.*Slug|.*Key)$/;

/** The plural of the same thing: `all_cited_rule_ids`, `rule_keys`, `slugs`. */
const IDENTIFIER_LIST_KEY =
  /^(ids|uuids|guids|slugs|.*_ids|.*_uuids|.*_slugs|.*_keys|.*Ids|.*Uuids|.*Slugs|.*Keys)$/;

export function isIdentifierKey(key: string): boolean {
  return IDENTIFIER_KEY.test(key) || IDENTIFIER_KEY.test(key.toLowerCase());
}

export function isIdentifierListKey(key: string): boolean {
  return (
    IDENTIFIER_LIST_KEY.test(key) || IDENTIFIER_LIST_KEY.test(key.toLowerCase())
  );
}

/** Readable twins, in the order a payload usually spells them. */
const NAME_SUFFIX = ["name", "label", "title", "text"] as const;

/**
 * THE ID DEFERS TO THE NAME BESIDE IT. Given `rule_id` in an object that also
 * carries `rule_name`, the name IS the answer and the id is a detail hung off
 * it — never a second row of equal weight. Returns the sibling key, or null
 * when the payload gives the reader no readable twin (then the id is all
 * there is, and it renders as a quiet identifier chip instead).
 */
export function humanNameSiblingKey(
  key: string,
  row: Record<string, unknown>,
): string | null {
  if (!isIdentifierKey(key)) return null;
  const stem = key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/_?(id|uuid|guid|slug|key)$/, "");
  for (const suffix of NAME_SUFFIX) {
    for (const candidate of stem
      ? [`${stem}_${suffix}`, `${stem}${suffix[0].toUpperCase()}${suffix.slice(1)}`]
      : [suffix]) {
      const found = Object.keys(row).find(
        (k) => k.toLowerCase() === candidate.toLowerCase(),
      );
      if (found && typeof row[found] === "string" && row[found]) return found;
    }
  }
  return null;
}

/** The identifier this readable field speaks for, if any — the hover detail. */
function identifierForNameKey(
  nameKey: string,
  row: Record<string, unknown>,
): string | null {
  for (const [k, v] of Object.entries(row)) {
    if (typeof v !== "string" || !v) continue;
    if (humanNameSiblingKey(k, row) === nameKey) return v;
  }
  return null;
}

/**
 * Numeric fields whose key reads as size/count metadata — rendered as quiet
 * badge chips instead of full rows. Conservative on purpose: a miss just
 * means the field renders as a normal inline row.
 */
const META_COUNT_KEY =
  /(^|_)(count|total|totals?|chars?|characters|len|length|size|bytes|tokens?|ms|milliseconds|duration|elapsed|latency)(_ms)?$/i;

function isMetaCountField(key: string, val: unknown): val is number {
  return (
    typeof val === "number" && Number.isFinite(val) && META_COUNT_KEY.test(key)
  );
}

/** Fixed locale keeps server HTML byte-identical to the browser's first render. */
export function formatMetaNumber(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) >= 10_000) {
    return new Intl.NumberFormat("en-US", {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }
  return n.toLocaleString("en-US");
}

/** True when a value renders on a single short line (fit for an inline row). */
function isInlineValue(key: string, val: unknown): boolean {
  if (typeof val === "string" && isIdentifierKey(key)) {
    return true;
  }
  const shape = detectResultShape(val);
  return (
    shape.kind === "empty" ||
    shape.kind === "scalar" ||
    shape.kind === "uuid" ||
    shape.kind === "url"
  );
}

function renderFieldValue(
  key: string,
  val: unknown,
  density: ResultDensity,
  depth: number,
  embedMedia: boolean,
): React.ReactNode {
  // A FIELD that is empty is one word, never the roomy empty STATE. `full`
  // density renders every key (that is what full means), and `EmptyResult`
  // at that density is a 40px centred icon block — so an ingest step whose
  // `errors` array was empty opened with a giant "No result returned" as the
  // most prominent thing on the page, above the material the reader came for
  // (seen 2026-08-18 on the Study Pack readout). The roomy state still owns
  // the top level, where "this returned nothing" IS the whole answer.
  if (detectResultShape(val).kind === "empty") {
    return <span className="text-sm text-muted-foreground/70">None</span>;
  }
  if (typeof val === "string" && isIdentifierKey(key)) {
    return <ShortId value={val} variant="full" />;
  }
  // Dotted enum reprs ("SklSkillType.REFERENCE") read as machine noise —
  // show the human form; the exact original stays on the title attr.
  if (typeof val === "string") {
    const human = humanizeEnumValue(val);
    if (human) {
      return (
        <span className="text-sm text-foreground" title={val}>
          {human}
        </span>
      );
    }
  }
  return (
    <ResultValue
      value={val}
      density={density}
      depth={depth + 1}
      embedMedia={embedMedia}
      mediaElementHint={mediaElementHintForKey(key)}
    />
  );
}

type Entry = [string, unknown];

/**
 * A list of machine identifiers, shown as a count the reader can open —
 * never as a bullet list of raw slugs. NOTHING FAILS SILENTLY: the count says
 * it is there and one click shows every one of them.
 */
const IdentifierListRow: React.FC<{ label: string; ids: string[] }> = ({
  label,
  ids,
}) => {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="text-xs text-muted-foreground">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="font-medium hover:underline"
      >
        {label} ({ids.length}){open ? " — hide" : " — show"}
      </button>
      {open && (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {ids.map((id, i) => (
            <ShortId key={`${id}-${i}`} value={id} />
          ))}
        </div>
      )}
    </div>
  );
};

export const KeyValueGrid: React.FC<KeyValueGridProps> = ({
  value,
  density = "inline",
  depth = 0,
  embedMedia = true,
  className,
}) => {
  const [showAll, setShowAll] = React.useState(false);
  const entries = Object.entries(value);

  const cap =
    density === "inline" && !showAll ? INLINE_ENTRY_CAP : entries.length;
  const shown = entries.slice(0, cap);
  const remaining = entries.length - shown.length;

  const chips: Entry[] = [];
  const inline: Entry[] = [];
  const blocks: Entry[] = [];
  const ids: Array<[string, string]> = [];
  const idLists: Array<[string, string[]]> = [];
  for (const entry of shown) {
    const [key, val] = entry;
    // INLINE DENSITY INTELLIGENCE (owner rules, 2026-07-15): empty values are
    // NOISE in chat ("Category · No result returned") — skip them; full
    // density + the Raw tab still carry every key.
    if (density === "inline" && detectResultShape(val).kind === "empty") continue;

    // THE ID NEVER OUTRANKS THE NAME BESIDE IT. When the object also carries
    // the readable twin, the id leaves the field list entirely and rides
    // along on that row's hover. (Judge finding, 2026-09-12: a parent-facing
    // regimen printed `rule_id` slugs next to every `rule_name`.)
    if (typeof val === "string" && humanNameSiblingKey(key, value) !== null) {
      continue;
    }
    // An identifier with no readable twin is still not a headline — it is a
    // quiet chip on the trailing identifier row, at EVERY density.
    if (typeof val === "string" && isIdentifierKey(key)) {
      ids.push([key, val]);
      continue;
    }
    // A LIST of identifiers is the same fact repeated: `all_cited_rule_ids`
    // rendered as a bullet list of raw slugs is the exact leak the judge saw.
    if (
      isIdentifierListKey(key) &&
      Array.isArray(val) &&
      val.length > 0 &&
      val.every((v) => typeof v === "string")
    ) {
      idLists.push([key, val as string[]]);
      continue;
    }
    if (isMetaCountField(key, val)) chips.push(entry);
    else if (isInlineValue(key, val)) inline.push(entry);
    else blocks.push(entry);
  }

  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      {inline.length > 0 && (
        <dl className="grid grid-cols-[fit-content(40%)_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1">
          {inline.map(([key, val]) => (
            <React.Fragment key={key}>
              <dt
                className="truncate text-xs font-medium text-muted-foreground"
                title={key}
              >
                {humanizeKey(key)}
              </dt>
              <dd
                className="min-w-0 text-sm"
                title={identifierForNameKey(key, value) ?? undefined}
              >
                {renderFieldValue(key, val, density, depth, embedMedia)}
              </dd>
            </React.Fragment>
          ))}
        </dl>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map(([key, val]) => (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-xs"
              title={key}
            >
              <span className="text-muted-foreground">{humanizeKey(key)}</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatMetaNumber(val as number)}
              </span>
            </span>
          ))}
        </div>
      )}

      {blocks.map(([key, val]) => (
        <div key={key} className="min-w-0">
          <div
            className="text-xs font-medium leading-none text-muted-foreground"
            title={key}
          >
            {humanizeKey(key)}
          </div>
          <div
            className="mt-1 min-w-0"
            title={identifierForNameKey(key, value) ?? undefined}
          >
            {renderFieldValue(key, val, density, depth, embedMedia)}
          </div>
        </div>
      ))}

      {idLists.map(([key, list]) => (
        <IdentifierListRow key={key} label={humanizeKey(key)} ids={list} />
      ))}

      {ids.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {ids.map(([key, val]) => (
            <span key={key} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              {humanizeKey(key)}
              <ShortId value={val} />
            </span>
          ))}
        </div>
      )}

      {remaining > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowAll(true);
          }}
          className="text-xs font-medium text-primary hover:underline"
        >
          +{remaining} more {remaining === 1 ? "field" : "fields"}
        </button>
      )}
    </div>
  );
};
