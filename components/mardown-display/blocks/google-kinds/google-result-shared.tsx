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
import {
  AlertTriangle,
  ArrowUpRight,
  ExternalLink,
  PauseCircle,
  ShieldQuestion,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatWhen } from "@/lib/detail/format";
import {
  DETACHED_EVENT_SENTENCE,
  UNAVAILABLE_EVENT_SENTENCE,
} from "@/features/google-workspace/calendar/record";
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
  type ChipTone,
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

// ─── THE WRITE CLAIM — ONE TRUTH TABLE, READ BY BOTH BLOCKS ─────────────────

/**
 * 🚨 A PREVIEW IS NOT A RECEIPT — AND THE PREVIEW ITSELF IS THE SIGNAL, NEVER
 * A SEPARATE FLAG (V-22, NEW-8).
 *
 * The first shipped version gated "Nothing was written" on `dry_run === true ||
 * awaiting_approval === true` while it rendered `would_append` / `would_write`
 * UNCONDITIONALLY. So a `would_append` carrying neither flag — a new action, a
 * serializer that drops a key, an approval path that forgets one, a flag that
 * arrives as the STRING `"true"` — printed the whole preview of the person's own
 * document with nothing saying it had not happened, and a payload carrying
 * `would_append` AND `appended` printed a green receipt chip beside the preview.
 * The honesty was carried by a flag, so one missing flag was a lie.
 *
 * THE FIX IS THE TABLE BELOW, encoded ONCE here and read by both Google blocks.
 * `P` = any `would_*` key arrived (non-null); `HOLD` = `dry_run` or
 * `awaiting_approval` read as a real `true`; `HOLD?` = one of those keys arrived
 * in a shape that is not a boolean, so we cannot read it; `C` = any
 * completed-write marker (`appended`, `written`, `created`, `imported`, `sent`)
 * read as a real `true`.
 *
 * | P | HOLD | HOLD? | C | state              | leads with                                               | receipt chips |
 * |---|------|-------|---|--------------------|----------------------------------------------------------|---------------|
 * | y | any  | any   | y | `contradictory`    | nothing was written + names BOTH words it said           | suppressed    |
 * | n | y    | any   | y | `contradictory`    | same                                                     | suppressed    |
 * | y | n/a  | y     | n | `unreadable_hold`  | nothing is shown as written + names the unreadable value | suppressed    |
 * | n | n    | y     | n | `unreadable_hold`  | same                                                     | suppressed    |
 * | y | awaiting     | n     | n | `awaiting_approval` | waiting for a person to approve it              | suppressed    |
 * | n | awaiting     | n     | n | `awaiting_approval` | same                                            | suppressed    |
 * | y | dry-run or NONE | n  | n | `preview`          | nothing was written — this is a preview                 | suppressed    |
 * | n | dry-run      | n     | n | `preview`          | nothing was written, AND no preview arrived             | suppressed    |
 * | n | n            | n     | y | `receipt`          | nothing — the chips are the truth                       | allowed       |
 * | n | n            | n     | n | `none`             | nothing                                                  | allowed       |
 *
 * The two properties that matter, and the reason the table is a pure function
 * with its own table-driven test: **a `would_*` shape ALWAYS leads with
 * "nothing was written"**, and **a completed-write chip renders only in
 * `receipt` / `none`** — so a payload can never show a green receipt beside a
 * preview, and a contradiction is NAMED rather than resolved in the reader's
 * favour.
 */
export type WriteClaimState =
  | "receipt"
  | "preview"
  | "awaiting_approval"
  | "contradictory"
  | "unreadable_hold"
  | "none";

export interface WriteClaim {
  state: WriteClaimState;
  /** The line that LEADS the block, above the change it describes. */
  headline: string | null;
  /** The second line: the contradiction named, or what is missing. */
  detail: string | null;
  /** True whenever the reader must be told nothing was written. */
  nothingWasWritten: boolean;
  /** False whenever a completed-write chip would be a lie. */
  showsReceiptChips: boolean;
  /** The approval hold, so the block can say who it waits with. */
  awaiting: boolean;
  /** Which `would_*` keys arrived. */
  previewKeys: string[];
  /** Which completed-write markers read as a real `true`. */
  completedKeys: string[];
  /** Hold keys that arrived in a shape that is not a boolean. */
  unreadableHoldKeys: string[];
}

const HOLD_KEYS = ["dry_run", "awaiting_approval"] as const;
/** Every marker either Google tool sets to claim a write actually happened. */
const COMPLETED_KEYS = ["appended", "written", "created", "imported", "sent"] as const;

/** `would_append` → `would append`; `dry_run` → `dry run`. */
function saidAs(key: string): string {
  return key.replace(/_/g, " ");
}

/** A `would_*` key that ARRIVED — the preview signal, whatever its shape. */
function previewKeysOf(value: Record<string, unknown>): string[] {
  return Object.keys(value).filter(
    (key) => key.startsWith("would_") && value[key] !== undefined && value[key] !== null,
  );
}

/** THE ONE READING of a Google result's write claim. Pure; no React. */
export function readWriteClaim(value: Record<string, unknown>): WriteClaim {
  const previewKeys = previewKeysOf(value);
  const completedKeys = COMPLETED_KEYS.filter((key) => readBool(value[key]) === true);
  const unreadableHoldKeys = HOLD_KEYS.filter(
    (key) =>
      value[key] !== undefined && value[key] !== null && readBool(value[key]) === null,
  );
  const dryRun = readBool(value.dry_run) === true;
  const awaiting = readBool(value.awaiting_approval) === true;
  const hasPreview = previewKeys.length > 0;
  const heldKeys = [
    ...(dryRun ? ["dry_run"] : []),
    ...(awaiting ? ["awaiting_approval"] : []),
  ];

  const common = {
    previewKeys,
    completedKeys: [...completedKeys],
    unreadableHoldKeys: [...unreadableHoldKeys],
    awaiting,
  };

  // 1. BOTH AT ONCE. Never resolved in the reader's favour: the contradiction is
  //    the finding, and the safe reading is the one that claims nothing.
  if ((hasPreview || heldKeys.length > 0) && completedKeys.length > 0) {
    const said = saidAs(hasPreview ? previewKeys[0] : heldKeys[0]);
    return {
      ...common,
      state: "contradictory",
      nothingWasWritten: true,
      showsReceiptChips: false,
      headline: "Nothing is shown as written — this answer contradicts itself.",
      detail:
        `This answer says both "${said}" and "${completedKeys[0]}" — treating it as a ` +
        "preview; nothing is shown as written. Run it again, and if it says both a " +
        "second time, the tool that wrote this answer is wrong.",
    };
  }

  // 2. A HOLD FLAG WE CANNOT READ is not an absent hold flag.
  if (unreadableHoldKeys.length > 0) {
    const key = unreadableHoldKeys[0];
    return {
      ...common,
      state: "unreadable_hold",
      nothingWasWritten: true,
      showsReceiptChips: false,
      headline: "Nothing is shown as written.",
      detail:
        `This answer states "${key}" as ${JSON.stringify(value[key])} rather than true or ` +
        "false, so whether it already happened cannot be read — and a guess either way " +
        "would be a lie. Run it again.",
    };
  }

  // 3. A HOLD FOR A PERSON. Said whether or not a preview came with it.
  if (awaiting) {
    return {
      ...common,
      state: "awaiting_approval",
      nothingWasWritten: true,
      showsReceiptChips: false,
      headline: "Nothing was written — this change is waiting for a person to approve it.",
      detail: hasPreview
        ? null
        : "This answer does not show the change it is holding, so read the queued " +
          "change itself before approving it.",
    };
  }

  // 4. A PREVIEW — because a `would_*` arrived, flag or no flag.
  if (hasPreview || dryRun) {
    return {
      ...common,
      state: "preview",
      nothingWasWritten: true,
      showsReceiptChips: false,
      headline: "Nothing was written. This is a preview of the exact change.",
      detail: hasPreview
        ? null
        : "This answer does not show the change it would have made. Run it again and " +
          "read the change before approving it.",
    };
  }

  if (completedKeys.length > 0) {
    return {
      ...common,
      state: "receipt",
      nothingWasWritten: false,
      showsReceiptChips: true,
      headline: null,
      detail: null,
    };
  }

  return {
    ...common,
    state: "none",
    nothingWasWritten: false,
    showsReceiptChips: true,
    headline: null,
    detail: null,
  };
}

/**
 * NOTHING WAS WRITTEN — said first, said plainly, and decided by
 * {@link readWriteClaim} rather than by a flag this component reads itself.
 *
 * Every mutating Google action can run as a preview (`dry_run`) and an
 * organization can additionally require a person to approve the change
 * (`awaiting_approval` + `approval`). Both states mean the same thing to the
 * reader and it is the first thing they must know, so it leads — above the
 * preview it describes — and the approval's own facts (which knob decided, who
 * it waits with, the queue id) are named rather than implied.
 */
export const NothingWasWritten: React.FC<{
  claim: WriteClaim;
  approval: Record<string, unknown> | null;
}> = ({ claim, approval }) => {
  if (!claim.nothingWasWritten) return null;
  const knob = readText(approval?.knob);
  const mode = readText(approval?.mode);
  const waitingWith = readText(approval?.waiting_with);
  const approvalId = readText(approval?.approval_id);
  const attended = readBool(approval?.attended);
  const contradiction =
    claim.state === "contradictory" || claim.state === "unreadable_hold";
  return (
    <div className="min-w-0 rounded-md border border-warning/30 bg-warning/5 p-2.5 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-warning">
        {contradiction ? (
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        ) : claim.awaiting ? (
          <PauseCircle className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ShieldQuestion className="h-3.5 w-3.5 shrink-0" />
        )}
        {claim.headline}
      </div>
      {claim.detail ? (
        <p className="text-xs leading-relaxed text-foreground">{claim.detail}</p>
      ) : null}
      {claim.awaiting ? (
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
function boundsEntries(bounds: unknown): [string, string | number | boolean][] {
  if (!isRecord(bounds)) return [];
  return Object.entries(bounds).filter(
    ([, item]) =>
      item !== null &&
      item !== undefined &&
      (typeof item === "string" || typeof item === "number" || typeof item === "boolean"),
  ) as [string, string | number | boolean][];
}

/**
 * Whether the provider stated the window this answer was read under. Read by
 * {@link CountedFact} too: a number whose window nobody stated must SAY so
 * rather than print bare (V-22, NEW-10).
 */
export function hasStatedBounds(bounds: unknown): boolean {
  return boundsEntries(bounds).length > 0;
}

export const Bounds: React.FC<{ bounds: unknown }> = ({ bounds }) => {
  const entries = boundsEntries(bounds);
  if (entries.length === 0) return null;
  return (
    <ChipRow>
      <span className="text-xs text-muted-foreground">asked for</span>
      {entries.map(([key, item]) => (
        <StateChip
          key={key}
          label={`${key.replace(/_/g, " ")} ${readWhen(item) ?? String(item)}`}
        />
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

/**
 * "412 rows" — the count with the unit the tool named, never a bare number.
 *
 * 🚨 A NUMBER ALWAYS CARRIES ITS WINDOW (V-22, NEW-10). `bounds` is optional on
 * the declared kind, so "412 rows returned" with nothing stating what window it
 * was counted over is a legal payload — and a partial window read as a total is
 * exactly how a wrong answer gets a right value. The unknown window is
 * announced ON the number, the same way an unknown completeness is.
 */
export const CountedFact: React.FC<{
  count: unknown;
  unit: unknown;
  label?: string;
  /** Pass {@link hasStatedBounds} of the same payload's `bounds`. */
  windowStated?: boolean;
}> = ({ count, unit, label = "returned", windowStated = true }) => {
  const value = readNumber(count);
  if (value === null) return null;
  const noun = readText(unit)?.replace(/_/g, " ") ?? "items";
  return (
    <span className="text-sm font-medium text-foreground">
      <span className="tabular-nums">{value.toLocaleString()}</span>{" "}
      <span className="font-normal text-muted-foreground">
        {noun} {label}
        {windowStated ? null : " (window not stated by the provider)"}
      </span>
    </span>
  );
};

// ─── TIMESTAMPS AND FRESHNESS ───────────────────────────────────────────────

/** An ISO instant, as opposed to a date-only string, which is already readable. */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

/**
 * A machine timestamp rendered for a person, through the platform's ONE
 * formatter (`lib/detail/format`'s `formatWhen`, which the Detail primitive and
 * the CRM record fields already print every stored instant with). A raw
 * `2026-09-18T15:00:00Z` on a screen is a leaked column, not an answer
 * (V-22, NEW-14). Returns `null` for anything that is not an instant, so the
 * caller keeps printing whatever the tool actually said.
 */
export function readWhen(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : null;
  if (!text || !ISO_INSTANT.test(text)) return null;
  const formatted = formatWhen(text);
  return formatted === text ? null : formatted;
}

/**
 * A mirrored row's freshness, as a chip WITH ITS REMEDY.
 *
 * 🚨 EVERY FRESHNESS STATE NAMES WHAT TO DO (V-22, NEW-14). The first version
 * printed `record_sync_status` as a bare chip — the word `stale` with no
 * sentence and nothing to do about it, which is a stand-in that does not
 * announce itself. The vocabulary and the two sentences are the CALENDAR
 * record's own (`features/google-workspace/calendar/record.ts`), never a second
 * wording: a word this build does not know says so and still offers the door
 * beside it, exactly as `frozenEventNotice` does.
 */
export interface RecordSyncNotice {
  label: string;
  tone: ChipTone;
  /** What to do about it. `null` ONLY when there is nothing to do. */
  remedy: string | null;
}

/** The one door a chat block can offer for a stale mirror, named in words. */
const REFRESH_REMEDY = "Open it here and refresh it, or open it in Google.";

export function readRecordSyncNotice(
  status: unknown,
  /** The row's own sentence (`record_sync_status_reason`), when it sent one. */
  reason?: unknown,
): RecordSyncNotice | null {
  const word = readText(status)?.trim().toLowerCase() ?? null;
  if (!word) return null;
  const said = readText(reason)?.trim() ?? null;
  if (word === "available") {
    return { label: "in step with Google", tone: "good", remedy: said };
  }
  if (word === "detached") {
    // TERMINAL, AND NOT A FAILURE. A refresh is refused for a detached row, so
    // this state never offers one — the calendar record's own rule.
    return {
      label: "kept as AI Matrx data",
      tone: "neutral",
      remedy: said ?? DETACHED_EVENT_SENTENCE,
    };
  }
  if (word === "unavailable") {
    return {
      label: "not answered by Google",
      tone: "warn",
      remedy: `${said ?? UNAVAILABLE_EVENT_SENTENCE} ${REFRESH_REMEDY}`,
    };
  }
  return {
    label: word,
    tone: "warn",
    remedy:
      said ??
      `This row reports a freshness this app does not recognise ("${word}"), so it may ` +
        `not be refreshing. ${REFRESH_REMEDY}`,
  };
}

/** The chip and its remedy, together — never one without the other. */
export const RecordSyncState: React.FC<{ status: unknown; reason?: unknown }> = ({
  status,
  reason,
}) => {
  const notice = readRecordSyncNotice(status, reason);
  if (!notice) return null;
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1">
      <StateChip label={notice.label} tone={notice.tone} />
      {notice.remedy ? (
        <span className="min-w-0 break-words text-xs text-muted-foreground">
          {notice.remedy}
        </span>
      ) : null}
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
