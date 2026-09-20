"use client";

/**
 * Shared substrate for the RUNTIME RESULT kind families — the four components
 * that took 61 kinds off the `generic_structured` floor (GAP 6, 2026-08-23).
 *
 * WHY these exist at all. The floor is not ugly: `GenericStructuredView` hands
 * the value to `ResultValue`, which already turns uniform arrays into real
 * tables and key/value objects into a readable grid. What the floor CANNOT do
 * is decide what MATTERS — every field arrives with equal weight, so a reader
 * looking for "did it branch left or right", "how many did I lose", "which
 * file", or "what is the value" has to hunt for it. Each component here
 * contributes exactly one thing: **the headline its family's reader came for**,
 * with everything else demoted to a meta strip and the payload still rendered
 * at full fidelity by the platform's existing viewer.
 *
 * INVENTORY LAW (survey, 2026-08-23): the value rendering is NOT re-implemented
 * here. `ResultValue` / `ResultMarkdown` / `ResultScalar` / `KeyValueGrid`
 * (features/tool-call-visualization/result-fields/) are the platform's honest
 * value viewer and every component below delegates to them, exactly as
 * `WebAnalysisItemBlock` — the 83-kind exemplar this family follows — does.
 *
 * ROUTE CONTRACT (identical for all four): reached ONLY through
 * `applyIrKindRoute`'s resolver-only path, which CLEARS `serverData` (the raw
 * region's `{ language: "json" }` annotation is not kind data). The value comes
 * from the envelope on `metadata.__ir`, with descending-fidelity recovery so a
 * region that never parsed still shows its source verbatim.
 *
 * BARE BY CONSTRUCTION (THE WRAPPER LAW): every host that routes a block here
 * already draws chrome. These contribute flow spacing and no frame.
 */

import React from "react";
import { Braces, Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";
import { readEnvelope } from "@/features/content-ir/redux/render-block-envelope";
import { KIND_KEY, reconstructRegionValue } from "@ai-matrx/content-ir";
import { humanizeKey } from "@/features/tool-call-visualization/result-fields/shape";
import { useClipboard } from "@/hooks/useClipboard";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";

/** Props every runtime-result block takes — the resolver-only route shape. */
export interface ResultKindBlockProps {
  /** The raw region source — the zero-loss floor when no envelope survived. */
  content: string;
  /** Carries `__ir` (the parsed envelope) and `__ir_route` (the seam marker). */
  metadata?: Record<string, unknown>;
  className?: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function readBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/**
 * Descending-fidelity recovery, identical to the generic block's: the envelope
 * is the source of truth (it merges residues back, so unknown keys survive), a
 * bare `JSON.parse` is the floor, and unparseable text is never swallowed.
 *
 * `recovered: false` means the region never parsed — the caller MUST fall back
 * to {@link RawRegion} rather than render an empty shell.
 */
export function readKindValue(
  content: string,
  metadata: Record<string, unknown> | undefined,
): { value: unknown; recovered: boolean; kind: string; streaming: boolean } {
  const envelope = readEnvelope(metadata);
  const streaming = (envelope?.root.status ?? "complete") === "streaming";
  const kind = envelope?.root.kind ?? "";
  if (envelope) {
    return { value: reconstructRegionValue(envelope), recovered: true, kind, streaming };
  }
  try {
    return { value: JSON.parse(content) as unknown, recovered: true, kind, streaming };
  } catch {
    return { value: null, recovered: false, kind, streaming };
  }
}

/** Zero-data-loss backstop: the region never parsed, so show it verbatim. */
export const RawRegion: React.FC<{ content: string; className?: string }> = ({
  content,
  className,
}) => (
  <pre
    className={cn(
      "my-2 max-h-96 overflow-auto font-mono text-xs leading-relaxed text-muted-foreground",
      className,
    )}
  >
    {content}
  </pre>
);

/** The streaming cue every kind component shows while its value is arriving. */
export const StillArriving: React.FC = () => (
  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
    <Braces className="h-3.5 w-3.5 shrink-0 animate-pulse" />
    <span>Still arriving…</span>
  </div>
);

export type ChipTone = "neutral" | "good" | "bad" | "warn" | "accent";

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  good: "bg-success/10 text-success",
  bad: "bg-destructive/10 text-destructive",
  warn: "bg-warning/10 text-warning",
  accent: "bg-primary/10 text-primary",
};

/**
 * A counted fact — "12 kept", "3 dropped", "wave 4". The number leads because
 * a reader scanning a run is counting, not reading.
 */
export const CountChip: React.FC<{
  value: number | string;
  label: string;
  tone?: ChipTone;
  icon?: React.ReactNode;
  title?: string;
}> = ({ value, label, tone = "neutral", icon, title }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
      CHIP_TONE[tone],
    )}
    {...(title ? { title } : {})}
  >
    {icon}
    <span className="tabular-nums">
      {typeof value === "number" ? value.toLocaleString() : value}
    </span>
    <span className="font-normal opacity-80">{label}</span>
  </span>
);

/** A stated fact with no count — "created", "truncated", "dry run". */
export const StateChip: React.FC<{
  label: string;
  tone?: ChipTone;
  icon?: React.ReactNode;
}> = ({ label, tone = "neutral", icon }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
      CHIP_TONE[tone],
    )}
  >
    {icon}
    {label}
  </span>
);

/** The chip row every family puts under its headline. */
export const ChipRow: React.FC<{ children: React.ReactNode; className?: string }> = ({
  children,
  className,
}) => (
  <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
    {children}
  </div>
);

/**
 * 🚨 THE ONE PASS THAT DECIDES WHAT THE STRIP PRINTS — exported so a caller can
 * ask what it WILL print without re-deriving the rule (F-104, V-23 NEW-5).
 *
 * A card that says "this read returned no rows" under the rows it just printed
 * is lying, and the only way that cannot drift is for the emptiness question and
 * the printing to run the SAME filter. {@link MetaStrip} renders exactly these
 * entries; {@link printsResidualFacts} asks whether there are any.
 */
export function metaStripEntries(
  value: Record<string, unknown>,
  omit: readonly string[],
): [string, string | number | boolean][] {
  const skip = new Set<string>([...omit, KIND_KEY]);
  return Object.entries(value).filter(
    ([key, item]) =>
      !skip.has(key) &&
      item !== null &&
      item !== undefined &&
      (typeof item === "string" || typeof item === "number" || typeof item === "boolean"),
  ) as [string, string | number | boolean][];
}

/**
 * 🚨 A STATED VALUE IS NOT AUTOMATICALLY A STATED FACT (F-109, V-24 NEW-2).
 *
 * An empty collection is the SHAPE of an answer with nothing in it, and a blank
 * string is nothing at all. Counting either as content is how `rows: []` — the
 * literal thing a GA4 read with no rows returns — made a card believe something
 * came back. A number or a boolean IS a stated fact, however small.
 *
 * 🚨 AND IT IS RECURSIVE (Cursor Bugbot on `11aaca7c`). The first version asked
 * only whether a record had KEYS, so `data: { rows: [] }` — the same empty read
 * with the wrapper the tool actually sends — read as content: four spellings
 * fixed, the class not. A record is substantive only when one of its own values
 * is, an array only when one of its elements is, to a bounded depth.
 *
 * 🚨 AND IT LIVES HERE, not in the Google substrate, because {@link
 * leftoverEntries} below is the pass EVERY family's residue is rendered from
 * and asked about — the two Google families, `platform_record`, and the four
 * runtime-result families. A predicate that held for one of them and not the
 * others is the drift these shared passes exist to make impossible.
 */
export function isSubstantiveValue(item: unknown, depth = 0): boolean {
  if (item === null || item === undefined) return false;
  if (typeof item === "string") return item.trim() !== "";
  if (Array.isArray(item) || isRecord(item)) {
    // A container that is only containers all the way down carries no fact. The
    // bound stops a cyclic or pathological value from hanging the render; at the
    // bound we say "substantive" rather than "empty", because a payload this
    // deep is never the empty read this predicate exists to recognise, and the
    // safe answer is the one that does not claim nothing came back.
    if (depth >= MAX_SUBSTANCE_DEPTH) return true;
    const children = Array.isArray(item) ? item : Object.values(item);
    return children.some((child) => isSubstantiveValue(child, depth + 1));
  }
  return true;
}

/** How far down {@link isSubstantiveValue} looks for one real fact. */
const MAX_SUBSTANCE_DEPTH = 8;

/**
 * The same pass for {@link LeftoverFields} — the non-scalar residue, minus the
 * containers that hold no fact.
 *
 * 🚨 AN EMPTY COLLECTION IS NOT "ALSO RETURNED". `rows: []` printed under the
 * heading "Also returned" tells the reader something came back, one line under
 * a footer saying nothing did — and a `1 field did not apply — show` toggle is
 * the reader's only way to discover it was empty all along. The emptiness
 * question and the printing run the SAME filter here, so neither can say a
 * thing the other contradicts.
 */
export function leftoverEntries(
  value: Record<string, unknown>,
  omit: readonly string[],
): [string, unknown][] {
  const skip = new Set<string>([...omit, KIND_KEY]);
  return Object.entries(value).filter(
    ([key, item]) =>
      !skip.has(key) &&
      item !== null &&
      item !== undefined &&
      typeof item === "object" &&
      isSubstantiveValue(item),
  );
}

/**
 * True when this card will print at least one residual fact of ANY shape —
 * a promoted-scalar strip entry or a leftover object. Derived from what the
 * card actually prints, never from a hand list of keys.
 */
export function printsResidualFacts(
  value: Record<string, unknown>,
  omit: readonly string[],
): boolean {
  return metaStripEntries(value, omit).length > 0 || leftoverEntries(value, omit).length > 0;
}

/**
 * The secondary facts a family did not promote — rendered small, in one line
 * per fact, so they stay readable without competing with the headline. Fields
 * the family already showed are passed in `omit` and never repeated (a fact
 * shown twice reads as two different facts).
 */
export const MetaStrip: React.FC<{
  value: Record<string, unknown>;
  omit: readonly string[];
  className?: string;
}> = ({ value, omit, className }) => {
  const entries = metaStripEntries(value, omit);
  if (entries.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs", className)}>
      {entries.map(([key, item]) => (
        <span key={key} className="min-w-0">
          <span className="text-muted-foreground">{humanizeKey(key)}: </span>
          <span className="break-all font-medium text-foreground">
            {typeof item === "number" ? item.toLocaleString() : String(item)}
          </span>
        </span>
      ))}
    </div>
  );
};

/** A labelled section — the one heading treatment shared by all four families. */
export const Section: React.FC<{
  label: string;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}> = ({ label, children, trailing }) => (
  <div className="min-w-0 space-y-1">
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      {trailing}
    </div>
    {children}
  </div>
);

/**
 * HIDE NOTHING, part two. {@link MetaStrip} can only carry scalars, so a
 * leftover OBJECT or ARRAY the family did not promote would silently vanish —
 * `uploaded_asset.variants`, `http_response.headers`, `node_error.details`.
 * This renders exactly those through the platform's value viewer, under one
 * honest heading, and renders nothing at all when there is nothing left.
 */
export const LeftoverFields: React.FC<{
  value: Record<string, unknown>;
  omit: readonly string[];
  label?: string;
}> = ({ value, omit, label = "Also returned" }) => {
  const rest = leftoverEntries(value, omit);
  if (rest.length === 0) return null;
  return (
    <Section label={label}>
      <ResultValue value={Object.fromEntries(rest)} density="full" />
    </Section>
  );
};


/**
 * Copy affordance for the one string a reader actually wants on their
 * clipboard — a path, a digest, a slug, a rendered document. Uses the
 * platform's `useClipboard` (toasts included); never a bare navigator call.
 */
export const CopyValueButton: React.FC<{ text: string; what: string }> = ({
  text,
  what,
}) => {
  const { copyText } = useClipboard();
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${what}`}
      title={`Copy ${what}`}
      onClick={(event) => {
        event.stopPropagation();
        void copyText(text, `${what} copied`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
      }}
      className="inline-flex shrink-0 items-center rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
};

/**
 * `work_queue_wave_result` → "Work queue wave". The kind slug is the only
 * label the platform has (`KindDefinition` carries no display name), and 61
 * hardcoded titles is exactly the duplication these components exist to avoid.
 */
export function kindLabel(kind: string): string {
  if (!kind) return "";
  const core = kind.replace(/_(result|value|content)$/, "");
  return core ? humanizeKey(core) : "";
}
