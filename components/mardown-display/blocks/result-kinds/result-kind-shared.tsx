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
import { reconstructRegionValue } from "@ai-matrx/content-ir";
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
  const skip = new Set<string>([...omit, "__kind"]);
  const entries = Object.entries(value).filter(
    ([key, item]) =>
      !skip.has(key) &&
      item !== null &&
      item !== undefined &&
      (typeof item === "string" || typeof item === "number" || typeof item === "boolean"),
  );
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
  const skip = new Set<string>([...omit, "__kind"]);
  const rest = Object.entries(value).filter(
    ([key, item]) =>
      !skip.has(key) &&
      item !== null &&
      item !== undefined &&
      typeof item === "object",
  );
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
