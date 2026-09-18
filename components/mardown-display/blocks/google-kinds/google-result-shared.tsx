"use client";

/**
 * Shared substrate for the TWO Google tool-result kinds — `google_workspace_result`
 * and `google_marketing_result`.
 *
 * WHY these two components exist. Both kinds were registered with a schema and a
 * canonical example but NO `content_ir.kind_component` row, so every Google
 * answer a person saw in chat arrived through `generic_structured` — the
 * can-never-fail key/value dump. The dump is not broken; it simply cannot decide
 * what matters. For these two tools what matters is unusually specific:
 *
 *  - a WRITE that did not happen yet (`dry_run`, `awaiting_approval`) must read
 *    as a preview of the person's OWN document, not as a receipt;
 *  - a marketing NUMBER must never appear without the window, the cap and the
 *    lag it was read under;
 *  - a Record id must be a door, because the row in the result is the same
 *    object the person's own screens show.
 *
 * ONE COMPONENT PER KIND (the platform's one-component law). Each component
 * branches on the SHAPE OF THE DATA — which preview block, which collection,
 * which honesty field arrived — never on a per-action switch, because fifteen
 * actions with a renderer each is fifteen things to drift.
 *
 * ROUTE CONTRACT: reached only through `applyIrKindRoute`'s resolver path from
 * an active `role='output'` `kind_component` row, exactly like the four
 * runtime-result families. `serverData` is cleared on that path, so the value
 * comes from the envelope on `metadata.__ir` with the descending-fidelity
 * recovery in `result-kind-shared.tsx` (a region that never parsed is shown
 * verbatim, never swallowed).
 *
 * THE VALUE VIEWER IS NOT RE-IMPLEMENTED HERE. `ResultValue`
 * (features/tool-call-visualization/result-fields/) is the platform's honest
 * viewer — uniform arrays become real tables — and every payload region below
 * delegates to it, as the `file_operation_result` family does.
 *
 * BARE BY CONSTRUCTION (THE WRAPPER LAW): every host that routes a block here
 * already draws chrome. These contribute flow spacing and no frame.
 */

import React from "react";
import { ArrowUpRight, ExternalLink, PauseCircle, ShieldQuestion } from "lucide-react";

import { cn } from "@/lib/utils";
import { TextWithDoors } from "@/components/official/entity-ref/TextWithDoors";
import { getItemConfig } from "@/features/item-presentation/registry";
import { useOpenItemPresentation } from "@/features/item-presentation/useOpenItemPresentation";
import type { ItemType } from "@/features/item-presentation/types";
import {
  ChipRow,
  Section,
  StateChip,
  isRecord,
  readBool,
  readNumber,
  readText,
} from "../result-kinds/result-kind-shared";

/** A list of records, or `null` when the key did not arrive as one. */
export function readRows(value: unknown): Record<string, unknown>[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rows = value.filter(isRecord);
  return rows.length > 0 ? rows : null;
}

/** A nested block (a preview, a plan, a receipt), or `null`. */
export function readBlock(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

/**
 * THE DOOR, through the ONE open path.
 *
 * A Google answer names AI Matrx rows — `record_id` on a calendar event,
 * `person_id` on an imported contact, `matrx_task_id` on an imported task — and
 * the server's own note says to use those rather than the Google id. Printed as
 * text that is a dead end with extra steps (THE DOOR LAW). `useOpenItemPresentation`
 * is the platform's single opener for these item types, so this renders nothing
 * at all when the type has no wired opener: a control that cannot open is worse
 * than no control.
 */
export const RecordDoor: React.FC<{
  type: ItemType;
  id: unknown;
  name?: string | null;
  /** Shown instead of the name when the row has none. */
  fallbackLabel?: string;
}> = ({ type, id, name, fallbackLabel = "record" }) => {
  const open = useOpenItemPresentation();
  const recordId = readText(id);
  const { config, recognized } = getItemConfig(type);
  if (!recordId || !recognized || !config.open) return null;
  const label = name?.trim() || fallbackLabel;
  return (
    <button
      type="button"
      aria-label={`Open ${label} in AI Matrx`}
      title={`Open ${label} in AI Matrx`}
      onClick={(event) => {
        event.stopPropagation();
        open(type, recordId, { name: name ?? undefined });
      }}
      className="inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
    >
      Open
      <ArrowUpRight className="h-3 w-3" />
    </button>
  );
};

/**
 * The file at Google. Not a Record and not a substitute for one — the person's
 * own copy, which is where a Doc or a deck is actually edited.
 */
export const OpenInGoogle: React.FC<{ href: unknown; label?: string }> = ({
  href,
  label = "Open in Google",
}) => {
  const url = readText(href);
  if (!url || !/^https?:\/\//.test(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
};

/** A sentence somebody else wrote, printed verbatim with its ids as doors. */
export const ServerSentence: React.FC<{
  text: unknown;
  tone?: "muted" | "warn";
}> = ({ text, tone = "muted" }) => {
  const sentence = readText(text);
  if (!sentence) return null;
  return (
    <p
      className={cn(
        "text-xs leading-relaxed",
        tone === "warn" ? "text-warning" : "text-muted-foreground",
      )}
    >
      <TextWithDoors text={sentence} />
    </p>
  );
};

/**
 * NOTHING WAS WRITTEN — said first, said plainly.
 *
 * Every mutating Google action can run as a preview (`dry_run`) and an
 * organization can additionally require a person to approve the change
 * (`awaiting_approval` + `approval`). Both states mean the same thing to the
 * reader and it is the first thing they must know, so it leads — above the
 * preview it describes — and the approval's own facts (which knob decided, who
 * it waits with, the queue id) are named rather than implied.
 */
export const NothingWasWritten: React.FC<{
  dryRun: boolean;
  awaiting: boolean;
  approval: Record<string, unknown> | null;
}> = ({ dryRun, awaiting, approval }) => {
  if (!dryRun && !awaiting) return null;
  const knob = readText(approval?.knob);
  const mode = readText(approval?.mode);
  const waitingWith = readText(approval?.waiting_with);
  const approvalId = readText(approval?.approval_id);
  const attended = readBool(approval?.attended);
  return (
    <div className="min-w-0 rounded-md border border-warning/30 bg-warning/5 p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
        {awaiting ? (
          <PauseCircle className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ShieldQuestion className="h-3.5 w-3.5 shrink-0" />
        )}
        {awaiting
          ? "Nothing was written — this change is waiting for a person to approve it."
          : "Nothing was written. This is a preview of the exact change."}
      </div>
      {awaiting ? (
        <ChipRow>
          {waitingWith ? <StateChip label={`waiting with ${waitingWith}`} tone="warn" /> : null}
          {mode ? <StateChip label={`mode ${mode}`} /> : null}
          {knob ? <StateChip label={knob} /> : null}
          {attended !== null ? (
            <StateChip label={attended ? "asked for in the moment" : "unattended run"} />
          ) : null}
          {approvalId ? <StateChip label={`queue id ${approvalId}`} /> : null}
        </ChipRow>
      ) : null}
    </div>
  );
};

/**
 * THE HONESTY TRIO, PRINTED ON THE NUMBERS.
 *
 * Both tools state what they were ASKED for (`bounds`), whether the answer hit
 * a cap (`truncated`, `completeness`), how old it is (`freshness`) and the
 * sentence that explains the cap (`limit_note`). A number shown without them is
 * how a partial window becomes a reported total — so these never collapse into
 * a footnote and never disappear when they are `false` in a way that matters.
 */
export const Bounds: React.FC<{ bounds: unknown }> = ({ bounds }) => {
  if (!isRecord(bounds)) return null;
  const entries = Object.entries(bounds).filter(
    ([, item]) =>
      item !== null &&
      item !== undefined &&
      (typeof item === "string" || typeof item === "number" || typeof item === "boolean"),
  );
  if (entries.length === 0) return null;
  return (
    <ChipRow>
      <span className="text-xs text-muted-foreground">asked for</span>
      {entries.map(([key, item]) => (
        <StateChip key={key} label={`${key.replace(/_/g, " ")} ${String(item)}`} />
      ))}
    </ChipRow>
  );
};

/** `truncated` / `completeness` as a verdict, never a silent omission. */
export const TruncationChip: React.FC<{
  truncated: unknown;
  completeness?: unknown;
}> = ({ truncated, completeness }) => {
  const flag = readBool(truncated);
  const verdict = readText(completeness);
  if (flag === true) {
    return <StateChip label="capped — more exists than is shown" tone="warn" />;
  }
  if (verdict === "bounded_preview") {
    return <StateChip label="a bounded preview, not the whole set" tone="warn" />;
  }
  if (flag === false) {
    return <StateChip label="complete within the window asked for" tone="good" />;
  }
  // `null` is a real, declared state: the provider cannot say. Never read as
  // "complete".
  return <StateChip label="completeness unknown — the provider does not say" tone="warn" />;
};

/** "412 rows" — the count with the unit the tool named, never a bare number. */
export const CountedFact: React.FC<{
  count: unknown;
  unit: unknown;
  label?: string;
}> = ({ count, unit, label = "returned" }) => {
  const value = readNumber(count);
  if (value === null) return null;
  const noun = readText(unit)?.replace(/_/g, " ") ?? "items";
  return (
    <span className="text-sm font-medium text-foreground">
      <span className="tabular-nums">{value.toLocaleString()}</span>{" "}
      <span className="font-normal text-muted-foreground">
        {noun} {label}
      </span>
    </span>
  );
};

/** A bordered, bounded body region — a document window, a draft, a block. */
export const BodyRegion: React.FC<{
  children: React.ReactNode;
  tone?: "neutral" | "added";
  max?: string;
}> = ({ children, tone = "neutral", max = "max-h-80" }) => (
  <pre
    className={cn(
      "min-w-0 overflow-auto whitespace-pre-wrap break-words rounded-md border p-2.5 font-mono text-xs leading-relaxed text-foreground",
      max,
      tone === "added" ? "border-success/40 bg-success/5" : "border-border bg-card",
    )}
  >
    {children}
  </pre>
);

export { Section, ChipRow, StateChip };
