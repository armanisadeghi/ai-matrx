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
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import {
  entityTokenForItemType,
  getItemConfig,
  recordTableTarget,
} from "@/features/item-presentation/registry";
import { useOpenItemPresentation } from "@/features/item-presentation/useOpenItemPresentation";
import type { ItemType } from "@/features/item-presentation/types";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";
import { humanizeKey } from "@/features/tool-call-visualization/result-fields/shape";
import {
  ChipRow,
  Section,
  StateChip,
  isRecord,
  leftoverEntries,
  metaStripEntries,
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
 *
 * 🚨 THE ROW'S OWN `record_table` OUTRANKS THE CALLER'S `type` (F-93, V-22 NEW-9).
 * Our servers stamp `record_id` AND `record_table` (`"schema.table"`) on every row
 * they name. A caller that hardcodes the type is confidently wrong the moment the
 * stamp says something else: V-22 fed a calendar-shaped event carrying
 * `record_table: "media.source_library"` to `type="calendar_event"` and got an
 * Open control for a calendar event with a foreign id — the V-21
 * `document → udt_document` defect in a new place. So when a row carries the
 * stamp, the stamp decides, through the ONE resolution (`recordTableTarget`,
 * derived from the entity registry and the item-presentation type map). A
 * stamp naming a table NO REGISTERED ENTITY claims resolves to nothing and this
 * renders NO door — which is the correct answer, because a door to the wrong
 * record reads as a fact and is a lie. `type` remains the answer for a row with
 * no stamp (an imported Person carries `person_id`, not `record_table`).
 *
 * 🚨 NO IN-PLACE OPENER IS NOT NO DOOR (F-104, V-23 NEW-6; ruling R35). The
 * first version stopped at the opener: a row stamped
 * `record_table: "media.source_library"` got no control at all, although
 * `media_source_library` is a registered entity whose `hrefFor` —
 * `/libraries/<id>` — is a working screen the person can use. R35 says
 * `hrefFor` is the durable ADDRESS and `useOpenItemPresentation` is the DOOR,
 * and both are required; so the refusal has a second leg. The opener runs when
 * an item type reads the table; otherwise the token's own durable address is
 * rendered through the platform's ONE address-door primitive
 * (`EntityDoorControls` — open + new tab, and it renders nothing itself when
 * the token has neither route nor peek); only when NEITHER answers is nothing
 * rendered. The same ladder applies to an unstamped row, whose `type` may also
 * be a registered entity with an address and no opener.
 */
export const RecordDoor: React.FC<{
  type: ItemType;
  id: unknown;
  name?: string | null;
  /** Shown instead of the name when the row has none. */
  fallbackLabel?: string;
  /** The server's own `record_table` for THIS row, when the payload carries one. */
  recordTable?: unknown;
}> = ({ type, id, name, fallbackLabel = "record", recordTable }) => {
  const open = useOpenItemPresentation();
  const recordId = readText(id);
  const stamp = readText(recordTable);
  const stamped = stamp ? recordTableTarget(recordTable) : null;
  // A stamp that arrived and named a table NO entity claims is a REFUSAL, not a
  // reason to fall back to the caller's guess.
  if (stamp && !stamped) return null;
  const resolvedType = stamped?.itemType ?? (stamped ? null : type);
  const { config, recognized } = getItemConfig(resolvedType);
  const label = name?.trim() || fallbackLabel;
  if (!recordId) return null;
  if (!recognized || !config.open) {
    // LEG TWO (R35): no in-place opener — the durable address IS the door.
    const token = stamped?.token ?? entityTokenForItemType(resolvedType);
    if (!token) return null;
    return (
      <EntityDoorControls
        token={token}
        id={recordId}
        name={name ?? label}
        showOpen
        alwaysShowActions
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={`Open ${label} in AI Matrx`}
      title={`Open ${label} in AI Matrx`}
      onClick={(event) => {
        event.stopPropagation();
        open(resolvedType, recordId, { name: name ?? undefined });
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
 * `awaiting_approval` read as a real `true`; `X` = ANY claim key — hold OR
 * completion — was STATED ({@link statesClaim}) in a shape that is not a
 * boolean, an explicit `null` included, so we cannot read it;
 * `C` = any completed-write marker (`appended`, `written`, `created`,
 * `imported`, `sent`) read as a real `true`.
 *
 * 🚨 `X` COVERS EVERY CLAIM KEY, NOT ONLY THE HOLD FLAGS (F-104, V-23 NEW-4).
 * The shipped table gave an unreadable HOLD flag its own honest state and left
 * an unreadable COMPLETION flag falling through to `none`: V-23's
 * `{action: "append_document", title: "Q3 Plan", appended: "yes"}` rendered, in
 * full, "Q3 Plan Append document" — nothing about whether the append happened.
 * Worse, `appended` is in {@link WRITE_CLAIM_KEYS}, which both blocks omit from
 * the meta strip and the leftovers, so the key vanished from the screen
 * entirely: the one shape that most needs a reader is the one that got silence.
 * Both flag families are declared `bool | None` and both are read the same way,
 * so there is ONE unreadable rule for all of them, it names the key AND the
 * value the tool actually sent, and no claim key can leave the screen without a
 * word. (A `would_*` PREVIEW key has no unreadable reading: its value IS the
 * change, of whatever shape, and `UnmodelledPreviews` prints every one that
 * arrived — the schema's `| None` makes a null one an absent preview, which is
 * why null stays `none` rather than screaming on every serializer that emits
 * its nulls.)
 *
 * | P | HOLD | X | C | state               | leads with                                               | receipt chips |
 * |---|------|---|---|---------------------|----------------------------------------------------------|---------------|
 * | y | any  | any | y | `contradictory`   | nothing was written + names BOTH words it said           | suppressed    |
 * | n | y    | any | y | `contradictory`   | same                                                     | suppressed    |
 * | y | n/a  | y | n | `unreadable_claim` | nothing is shown as written + names the key AND value    | suppressed    |
 * | n | n    | y | any | `unreadable_claim`| same — an unreadable `appended` is not an absent one     | suppressed    |
 *
 * 🚨 `X` INCLUDES AN EXPLICIT `null` (F-109, V-24 NEW-1), and the two halves of
 * `X` do not rank the same. An unreadable COMPLETION marker (`appended: null`)
 * asks the very question nothing else in the payload can answer, so it outranks
 * everything but a contradiction. An unreadable HOLD flag (`dry_run: null`)
 * ranks BELOW a settled `awaiting_approval: true`, which already tells the
 * reader nothing was written — a definite answer is never downgraded to "cannot
 * be read" — and above a preview, so the flag can never leave the screen
 * unread.
 * | y | awaiting     | n | n | `awaiting_approval` | waiting for a person to approve it              | suppressed    |
 * | n | awaiting     | n | n | `awaiting_approval` | same                                            | suppressed    |
 * | y | dry-run or NONE | n | n | `preview`          | nothing was written — this is a preview          | suppressed    |
 * | n | dry-run      | n | n | `preview`          | nothing was written, AND no preview arrived             | suppressed    |
 * | n | n            | n | y | `receipt`          | nothing — the chips are the truth                       | allowed       |
 * | n | n            | n | n | `none`             | nothing                                                  | allowed       |
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
  | "unreadable_claim"
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
  /** Claim keys — hold OR completion — that arrived in a non-boolean shape. */
  unreadableClaimKeys: string[];
}

export const HOLD_KEYS = ["dry_run", "awaiting_approval"] as const;
/** Every marker either Google tool sets to claim a write actually happened. */
export const COMPLETED_KEYS = ["appended", "written", "created", "imported", "sent"] as const;

/**
 * 🚨 THE WRITE-CLAIM KEY FAMILY — ONE SOURCE, READ BY {@link readWriteClaim}
 * ITSELF AND BY BOTH BLOCKS' `PROMOTED` LISTS (F-95).
 *
 * `readWriteClaim` CONSUMES these keys (plus every dynamically-named `would_*`
 * key, which cannot be enumerated statically — see `previewKeysOf`) to produce
 * the summarized claim `NothingWasWritten` renders. A block that also prints
 * the SAME raw key through `MetaStrip`/`LeftoverFields` tells the reader the
 * same fact twice, once summarized and once as an unlabeled leftover — the
 * exact "shown twice reads as two different facts" case the omit list exists
 * to prevent. `approval` is included because `NothingWasWritten` reads it
 * directly (`readBlock(value.approval)`) for the same reason.
 *
 * A block must ALSO omit whatever `would_*` keys actually arrived
 * (`claim.previewKeys`, from the `WriteClaim` this same call returns) since
 * those names are open-ended and cannot live in a static array.
 */
export const WRITE_CLAIM_KEYS = [...HOLD_KEYS, ...COMPLETED_KEYS, "approval"] as const;

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
/**
 * 🚨 THE ONE READING OF "DID THIS PAYLOAD STATE THIS KEY AT ALL" (F-109, V-24
 * NEW-1).
 *
 * An ABSENT key states nothing. An explicit `null` is a stated value — the
 * tool declared the key and could not settle it — and the two are NOT the same
 * fact. Every claim key on both Google kinds is declared `bool | None`, so
 * `None` is the value a Python tool produces most easily the moment it cannot
 * tell; excluding it by hand is how `{action:"append_document", title:"Q3
 * Plan", appended:null}` rendered "Q3 Plan Append document" and nothing else,
 * with the key withheld from the strip as well because it is a
 * {@link WRITE_CLAIM_KEYS} member. This is the same distinction
 * {@link statesCompleteness} already draws for `truncated` (F-99) and it lives
 * here ONCE for the whole family. (`undefined` is treated as absent: `JSON.parse`
 * never produces it, so it can only come from a key someone deleted in code.)
 */
export function statesClaim(value: Record<string, unknown>, key: string): boolean {
  return key in value && value[key] !== undefined;
}

export function readWriteClaim(value: Record<string, unknown>): WriteClaim {
  const previewKeys = previewKeysOf(value);
  const completedKeys = COMPLETED_KEYS.filter((key) => readBool(value[key]) === true);
  // ONE unreadable rule for the whole boolean claim family (F-104, V-23 NEW-4),
  // and an explicit `null` is inside it (F-109, V-24 NEW-1).
  const unreadable = (key: string) =>
    statesClaim(value, key) && readBool(value[key]) === null;
  const unreadableHoldKeys = HOLD_KEYS.filter(unreadable);
  const unreadableCompletionKeys = COMPLETED_KEYS.filter(unreadable);
  const unreadableClaimKeys = [...unreadableHoldKeys, ...unreadableCompletionKeys];
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
    unreadableClaimKeys: [...unreadableClaimKeys],
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

  const unreadableClaim = (key: string): WriteClaim => ({
    ...common,
    state: "unreadable_claim",
    nothingWasWritten: true,
    showsReceiptChips: false,
    headline: "Nothing is shown as written.",
    detail:
      `This answer states "${key}" as ${JSON.stringify(value[key])} rather than true or ` +
      "false, so whether it already happened cannot be read — and a guess either way " +
      "would be a lie. Run it again.",
  });

  // 2. A COMPLETION MARKER WE CANNOT READ can never be settled by anything else
  //    in the payload — whether the write HAPPENED is exactly the question — so
  //    it outranks every state but a contradiction.
  if (unreadableCompletionKeys.length > 0) {
    return unreadableClaim(unreadableCompletionKeys[0]);
  }

  // 3. A HOLD FOR A PERSON. Said whether or not a preview came with it, and
  //    said ABOVE an unreadable hold flag (F-109): `awaiting_approval: true`
  //    SETTLES the reader's question — nothing was written, a person is holding
  //    it — so a `dry_run: null` beside it must not downgrade a definite answer
  //    to "cannot be read".
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

  // 4. A HOLD FLAG WE CANNOT READ is not an absent hold flag. It ranks below a
  //    settled hold and ABOVE a preview, because a `would_*` beside an
  //    unreadable `dry_run` still leaves the flag unread and the key would
  //    otherwise leave the screen (it is a `WRITE_CLAIM_KEYS` member).
  if (unreadableHoldKeys.length > 0) {
    return unreadableClaim(unreadableHoldKeys[0]);
  }

  // 5. A PREVIEW — because a `would_*` arrived, flag or no flag.
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
 * 🚨 THE ONE "IS THIS ANSWER TRULY EMPTY" PREDICATE (BUGBOT MEDIUM ON `eb641aee`).
 *
 * `GoogleMarketingResultBlock`'s footer says "This read returned no rows" when
 * nothing else printed — but `UnmodelledPreviews` (above) can now print a
 * `would_*` change even on a payload that carries none of the read-branch
 * fields (`verdict`, health flags, `checks`, `containers`, `data`). Before
 * this, a payload that was ONLY a write preview fell through the read-only
 * predicate and the footer said "no rows" directly under the change it just
 * showed — claiming nothing came back in the same breath as showing what
 * would happen.
 *
 * A read counts as substantive when it carries any of the block's own
 * read-branch content (`otherwiseSubstantive`, computed per block — the
 * marketing block's verdict/health-flag/checks/containers/data union) OR any
 * write claim at all (`claim.state !== "none"`): a preview, an approval hold,
 * an unreadable or contradictory hold, or a receipt. Only `"none"` — no
 * `would_*`, no hold flag, no completed-write marker — means the tool
 * genuinely said nothing, which is the one case "no rows" is honest.
 */
export function hasSubstantiveContent(
  claim: WriteClaim,
  otherwiseSubstantive: boolean,
  /** The whole payload, so the residual pass runs HERE and cannot be passed wrong. */
  value: Record<string, unknown>,
  /** The very same `omit` list the `MetaStrip`/`LeftoverFields` below are given. */
  omit: readonly string[],
): boolean {
  return (
    otherwiseSubstantive ||
    claim.state !== "none" ||
    printsSubstantiveResidual(value, omit)
  );
}

/**
 * 🚨 A STATED VALUE IS NOT AUTOMATICALLY A STATED FACT (F-109, V-24 NEW-2).
 *
 * An empty collection is the SHAPE of an answer with nothing in it, and a blank
 * string is nothing at all. Counting either as content is how `rows: []` — the
 * literal thing a GA4 read with no rows returns — made the card believe
 * something came back. A number or a boolean IS a stated fact, however small.
 *
 * 🚨 AND IT IS RECURSIVE (Cursor Bugbot on `11aaca7c`). The first version asked
 * only whether a record had KEYS, so `data: { rows: [] }` — the same empty GA4
 * read with the wrapper the tool actually sends — read as content and the
 * empty-read sentence never fired: four spellings fixed, the class not. A record
 * is substantive only when one of its own values is, an array only when one of
 * its elements is, to a bounded depth.
 */
/** How far down {@link isSubstantiveValue} looks for one real fact. */
const MAX_SUBSTANCE_DEPTH = 8;

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


/**
 * 🚨 THE REQUEST'S OWN PARAMETERS ARE THE FRAME, NEVER THE ANSWER (F-109,
 * V-24 NEW-2).
 *
 * The marketing tools echo the question back on the result — the site, the
 * property, the window, the row cap — and F-104 taught emptiness to come from
 * what the card PRINTS. The residual pass prints those echoes, so
 * `{action:"traffic_summary", site:"example.com", start_date:…, end_date:…,
 * rows:[]}` — the realistic empty GA4 read — read as a card full of facts and
 * never said no rows came. Only a payload carrying nothing but `action`, which
 * no tool emits, reached the sentence.
 *
 * A frame is what an empty result sits INSIDE. It makes the sentence more
 * specific ("for example.com, 2026-09-01 to 2026-09-15"); it never makes it
 * unreachable, and it is printed as the window it names rather than as a fact
 * that came back.
 *
 * Deliberately NOT here: `metrics` / `dimensions`. On a GA4 payload either can
 * carry the numbers themselves, and a key that might be the answer must never
 * be demoted to the question — that would trade this lie for a worse one.
 */
export const REQUEST_FRAME_KEYS = [
  "site",
  "site_url",
  "site_id",
  "domain",
  "property",
  "property_id",
  "channel",
  "channel_id",
  "container_id",
  "view_id",
  "query",
  "search_query",
  "start_date",
  "end_date",
  "date_range",
  "since",
  "until",
  "window",
  "period",
  "days",
  "row_limit",
  "limit",
  "page_size",
  "offset",
] as const;

/** The frame keys that state a WINDOW, as opposed to which thing was asked about. */
const WINDOW_FRAME_KEYS = [
  "start_date",
  "end_date",
  "date_range",
  "since",
  "until",
  "window",
  "period",
  "days",
] as const;

/** The frame keys that name WHICH thing was asked about. Printed first. */
const SUBJECT_FRAME_KEYS = [
  "site",
  "site_url",
  "site_id",
  "domain",
  "property",
  "property_id",
  "channel",
  "channel_id",
  "container_id",
  "view_id",
  "query",
  "search_query",
] as const;

export type FrameEntries = Record<string, string | number | boolean>;

/**
 * The request parameters this payload actually stated, minus anything the card
 * already prints itself (`omit` — the block's own PROMOTED list).
 */
export function statedFrame(
  value: Record<string, unknown>,
  omit: readonly string[] = [],
): FrameEntries {
  const skip = new Set<string>(omit);
  const frame: FrameEntries = {};
  for (const key of REQUEST_FRAME_KEYS) {
    if (skip.has(key)) continue;
    const item = value[key];
    if (
      (typeof item === "string" && item.trim() !== "") ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      frame[key] = item;
    }
  }
  return frame;
}

/**
 * Whether a WINDOW was stated for this read, by the provider's own `bounds` or
 * by the request parameters echoed on the payload. Read by `CountedFact` too: a
 * number whose window nobody stated must say so (V-22, NEW-10).
 */
export function statesWindow(
  value: Record<string, unknown>,
  bounds: unknown,
): boolean {
  return (
    hasStatedBounds(bounds) ||
    WINDOW_FRAME_KEYS.some((key) => isSubstantiveValue(value[key]))
  );
}

/** "example.com, 2026-09-01 to 2026-09-15" — the frame, said the way it reads. */
export function frameSentence(frame: FrameEntries): string | null {
  const parts: string[] = [];
  for (const key of SUBJECT_FRAME_KEYS) {
    if (frame[key] !== undefined) parts.push(String(frame[key]));
  }
  const start = frame.start_date ?? frame.since;
  const end = frame.end_date ?? frame.until;
  if (start !== undefined && end !== undefined) parts.push(`${start} to ${end}`);
  else if (start !== undefined) parts.push(`from ${start}`);
  else if (end !== undefined) parts.push(`through ${end}`);
  const said = new Set<string>([
    ...SUBJECT_FRAME_KEYS,
    "start_date",
    "end_date",
    "since",
    "until",
  ]);
  for (const [key, item] of Object.entries(frame)) {
    if (said.has(key)) continue;
    parts.push(`${saidAs(key)} ${item}`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * True when the card will print at least one residual fact that is an ANSWER —
 * the same passes `MetaStrip`/`LeftoverFields` print from, minus the request
 * frame and minus empty collections.
 */
export function printsSubstantiveResidual(
  value: Record<string, unknown>,
  omit: readonly string[],
): boolean {
  const skip = [...omit, ...REQUEST_FRAME_KEYS];
  return (
    metaStripEntries(value, skip).some(([, item]) => isSubstantiveValue(item)) ||
    leftoverEntries(value, skip).some(([, item]) => isSubstantiveValue(item))
  );
}

/**
 * 🚨 THE EMPTY-READ SENTENCE, AND THE WINDOW IT MAY NOT INVENT (F-104, V-23
 * NEW-5).
 *
 * V-23 sent `{action: "traffic_summary", site: "example.com", sessions: 1234,
 * users: 900}` and the marketing card printed "This read returned no rows for
 * the window above… widen the window" directly ABOVE "Site: example.com
 * Sessions: 1,234 Users: 900". Two lies in one sentence: it had just shown
 * 1,234 sessions, and there was no window above — none was stated. F-95/F-98
 * taught the predicate to respect a verdict and the `has_*` flags, but the
 * PROMOTED-SCALAR residue — the very facts the card prints last — was not in
 * that reading, so a payload whose whole answer arrives as unpromoted keys read
 * as empty.
 *
 * The fix is that both halves come from what the card ACTUALLY PRINTED:
 * emptiness is `hasSubstantiveContent(claim, …, value, omit)` — which runs
 * {@link printsSubstantiveResidual} itself, over the same omit list the strip is
 * rendered with — and the sentence names a window only when
 * {@link statesWindow} says one was stated. The residual pass moved INSIDE the
 * predicate in F-109 so no caller can hand it the wrong one, and the request's
 * own parameters are excluded from it (see {@link REQUEST_FRAME_KEYS}): the
 * question a read was asked is not an answer it returned.
 */
export function emptyReadSentence(
  windowStated: boolean,
  /** {@link frameSentence} of this payload's own request parameters, when it stated any. */
  frameText: string | null = null,
): string {
  const remedy = windowStated
    ? "widen the window or check the site this question is about"
    : "ask again with a window, or check the site this question is about";
  const where = frameText ? `for ${frameText}` : windowStated ? "for the window above" : null;
  if (!where) {
    return (
      "This read returned no rows, and no window was stated for it. That is an " +
      `answer, not a failure — ${remedy}.`
    );
  }
  const unwindowed = windowStated ? "" : ", and no window was stated for it";
  return (
    `This read returned no rows ${where}${unwindowed}. That is an answer, not a ` +
    `failure — ${remedy}.`
  );
}

/**
 * 🚨 THE LEAD STATES THE CLAIM; THE SERVER'S NOTE CARRIES ONLY THE REMEDY
 * (F-104, V-23 addendum; the F-98 "no fact prints twice" class).
 *
 * The canonical `google_workspace_result` example carries
 * `note: "NOTHING WAS WRITTEN. Show the user this exact block."` — a sentence
 * written for an AGENT, printed verbatim to a person under a lead that already
 * says "Nothing was written. This is a preview of the exact change." On
 * `/shapes/google_workspace_result` the reader therefore met the same claim
 * twice, which reads as two findings rather than one.
 *
 * Verbatim stays verbatim in every other respect: nothing is reworded, nothing
 * is re-ordered. Only a sentence that is PURELY the claim the lead already made
 * is dropped, and only while the lead is actually making it
 * (`claim.nothingWasWritten`) — so a `needs_client` answer's "NOTHING WAS
 * IMPORTED, and this is not a failure you can retry." keeps every word, and a
 * note that is only the claim disappears entirely rather than echoing.
 */
const BARE_WRITE_CLAIM =
  /^(?:and\s+)?(?:so\s+)?nothing\s+(?:at\s+all\s+)?(?:was|is|has\s+been|will\s+be|would\s+be)\s+(?:actually\s+|yet\s+)?(?:written|created|appended|imported|sent|changed|saved|modified|deleted)(?:\s+yet)?$/i;

export function noteWithoutRepeatedClaim(
  note: unknown,
  claim: WriteClaim,
): string | null {
  const text = readText(note);
  if (!text || !claim.nothingWasWritten) return text;
  const kept = text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !BARE_WRITE_CLAIM.test(sentence.trim().replace(/[.!?]+$/, "")))
    .join(" ")
    .trim();
  return kept === "" ? null : kept;
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
    claim.state === "contradictory" || claim.state === "unreadable_claim";
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
 * 🚨 EVERY `would_*` THAT ARRIVED IS SHOWN, EXACTLY ONCE (BUGBOT MEDIUM ON
 * F-95's `f881c9f6`).
 *
 * F-95 merged `claim.previewKeys` — every `would_*` key that arrived — into
 * both blocks' `omit` lists, on the reasoning that `NothingWasWritten` already
 * covers the write-claim family. It does not: `NothingWasWritten` only
 * ANNOUNCES that a preview exists ("nothing was written — this is a preview
 * of the exact change"); it never prints the change itself. A `would_*` shape
 * with no dedicated preview section — `would_delete` on the workspace block,
 * and EVERY `would_*` on the marketing block, which has no preview sections
 * at all because it is read-only — therefore vanished entirely: worse than
 * the double-print it replaced, because a preview whose content the reader
 * cannot see is a lie about what would happen.
 *
 * THE LAW: a `would_*` key that arrived renders exactly once — by its
 * dedicated preview section when the block has one for it (the caller passes
 * those names in `rendered`), otherwise by this ONE generic section here, per
 * key, labeled by the humanized key and printed through `ResultValue` at full
 * density. Either way the key then belongs in `omit` (still `claim.previewKeys`,
 * as before) because it IS shown now, not because it is hidden.
 */
export const UnmodelledPreviews: React.FC<{
  /** The full result value, so an unmodelled `would_*` key can be read off it. */
  value: Record<string, unknown>;
  claim: WriteClaim;
  /** `would_*` names this block already renders through a dedicated section. */
  rendered: readonly string[];
}> = ({ value, claim, rendered }) => {
  const dedicated = new Set(rendered);
  const remaining = claim.previewKeys.filter((key) => !dedicated.has(key));
  if (remaining.length === 0) return null;
  return (
    <>
      {remaining.map((key) => (
        <Section key={key} label={`The change it would make — ${humanizeKey(key)}`}>
          <ResultValue value={value[key]} density="full" />
        </Section>
      ))}
    </>
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

/**
 * 🚨 WHY `bounds` IS NOT THE SAME CLASS AS `truncated` (F-99). It is deliberate
 * that this collapses an ABSENT `bounds` and an explicit `bounds: null` into the
 * same answer, and it must stay that way. `truncated` is a VERDICT field — a
 * claim ABOUT the read — so with no key there is no claim to report, and
 * reporting one invents it. `bounds` is the WINDOW ITSELF: the annotation
 * {@link CountedFact} prints from it ("window not stated by the provider") is a
 * statement about THIS payload, and it is equally true whether the key was
 * omitted or arrived null. Silencing it for the absent case would delete the
 * V-22 / NEW-10 guard for the commonest payload of all — a bare number with no
 * window, read as a total.
 */

export const Bounds: React.FC<{ bounds: unknown; label?: string }> = ({
  bounds,
  label = "asked for",
}) => {
  const entries = boundsEntries(bounds);
  if (entries.length === 0) return null;
  return (
    <ChipRow>
      <span className="text-xs text-muted-foreground">{label}</span>
      {entries.map(([key, item]) => (
        <StateChip
          key={key}
          label={`${key.replace(/_/g, " ")} ${readWhen(item) ?? String(item)}`}
        />
      ))}
    </ChipRow>
  );
};

/**
 * Whether this payload STATES anything about completeness at all — the ONE
 * predicate {@link TruncationChip} and every card that frames it share.
 *
 * 🚨 AN EXPLICIT `null` IS A VERDICT; AN ABSENT KEY IS NOT (F-99, BUGBOT
 * MEDIUM). The declared kind says `truncated: bool | None` — "True/False when
 * the provider or our own cap says so; null when unknowable" — so an explicit
 * `null` is the provider declaring it cannot tell, which a reader MUST see. A
 * key that never arrived is not a declaration of anything: printing
 * "completeness unknown — the provider does not say" for it invents a verdict,
 * and it fired on every read that has no window to cap at all (the
 * tracking-health verdict, a Tag Manager container list, a YouTube channel) as
 * well as on any payload that simply omitted the key. An explicit
 * `completeness` verdict stands on its own and still renders.
 */
export function statesCompleteness(truncated: unknown, completeness?: unknown): boolean {
  return truncated !== undefined || readText(completeness) !== null;
}

/**
 * `truncated` / `completeness` as a verdict, never a silent omission — and
 * never an invented one either: with nothing stated, this renders NOTHING (see
 * {@link statesCompleteness}), so a card may mount it unconditionally.
 */
export const TruncationChip: React.FC<{
  truncated: unknown;
  completeness?: unknown;
}> = ({ truncated, completeness }) => {
  const flag = readBool(truncated);
  const verdict = readText(completeness);
  if (!statesCompleteness(truncated, completeness)) return null;
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
  // "complete". (An ABSENT key never reaches here — it stated nothing.)
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
