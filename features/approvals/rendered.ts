/**
 * THE ONE PREDICATE: "will this row render in this queue?"
 *
 * 🚨 IT IS ASKED BY THE BADGE, THE SECTION HEADER, THE LIST AND EVERY DEEP
 * LINK. Until 2026-09-17 three different rules answered that question and they
 * disagreed in both directions (round-2 hostile verification, common-docs
 * `/projects/google-native/VERIFY-U-P4-U-M1-R2.md` § A-i, A-ii):
 *
 * - the badge (`countPendingProposals`) narrowed the ACTION and stopped there,
 *   so a pending row whose `proposalKind` no registered kind renders was
 *   counted and shown nowhere — "1 waiting" over an empty screen. That window
 *   is not hypothetical: aidream's producer warns about exactly it when an
 *   action joins `PROPOSAL_KIND_BY_ACTION` before this repo registers its kind;
 * - the section header printed the RAW SERVER COUNT over rows the narrowing had
 *   already dropped, so header and badge could differ silently;
 * - the deep-link read called any pending proposal "waiting past the first page
 *   of this list", including the keyword kinds, which a person-scoped queue
 *   never mounts at all (Bugbot round 9, finding 9).
 *
 * - and, in the first version of this file, the predicate itself stopped at the
 *   action FAMILY for every shape but `approval_proposal`: mounting ANY keyword
 *   kind made every `apply_keyword_meaning` row on the platform "on screen
 *   here", so site A's queue reported site B's row as `pending` and two of the
 *   three keyword kinds — which read RPCs and render no ledger row at all —
 *   made that claim over rows nothing shows (Bugbot round 10, finding 1).
 *
 * So there is ONE function, and it takes THE MOUNT'S SCOPE. A row renders when
 * the mount carries a kind that reads its action shape AND that kind says it
 * renders THIS row HERE (`ApprovalKind.rendersRow`; the default recogniser is
 * "the kind's id IS the row's `proposalKind`", which exists only in the
 * `approval_proposal` family) — action narrowing, kind registration AND scope,
 * in one place. A row that belongs to another mount is refused WITH the door to
 * where it lives (`ApprovalKind.rowElsewhere`). Everything that reports a
 * number or a verdict about a row asks it, and a row it refuses is LOUD ONCE
 * in the console (`warnNotRendered`) rather than silently missing.
 *
 * It deliberately imports no registry: the caller passes the kinds its mount
 * actually has, which is what makes the same function serve `/approvals`, the
 * per-site console, the window panel and the badge.
 */

import { narrowAction, type AssistAction } from "@/features/assists/types";
import type {
  ApprovalKind,
  ApprovalRowFamily,
  ApprovalRowPlace,
  ApprovalScope,
} from "./types";

/** The action kinds those families are, in the assists ledger's vocabulary. */
export const ROW_FAMILY_ACTION_KIND: Record<
  ApprovalRowFamily,
  AssistAction["kind"]
> = {
  approval_proposal: "approval_proposal",
  keyword_meaning: "apply_keyword_meaning",
};

export function familyOf(kind: ApprovalKind): ApprovalRowFamily {
  return kind.reads ?? "approval_proposal";
}

export type RenderVerdict =
  | {
      renders: true;
      kind: ApprovalKind;
      family: ApprovalRowFamily;
      /** The registry id the row renders through. */
      proposalKind: string;
    }
  | {
      renders: false;
      /** One sentence for a developer, naming the kind when the row carries one. */
      why: string;
      /**
       * Set when SOME registered kind reads this row somewhere else — the row is
       * real and waiting, just not in this list — carrying the sentence and the
       * door a deep link answers with (THE DOOR LAW).
       */
      elsewhere: (ApprovalRowPlace & { kind: ApprovalKind }) | null;
    };

/**
 * THE QUESTION, in full: which kinds this mount carries, WHERE the mount is, and
 * (optionally) the whole registry so a refusal can say where the row lives.
 *
 * 🚨 `scope` IS NOT OPTIONAL. A predicate that judged a row without the mount's
 * scope answered for the wrong site: see `ApprovalKind.rendersRow`.
 */
export interface RenderQuestion {
  /** The kinds this mount actually mounted (`mountedApprovalKinds`). */
  kinds: readonly ApprovalKind[];
  /** WHERE this mount is — the same scope its kinds' readers are given. */
  scope: ApprovalScope;
  /** THE registry, to answer "some kind reads this, just not here". */
  allKinds?: readonly ApprovalKind[];
}

/** Does this ONE kind, on THIS mount, turn THIS row into an item? */
function kindRendersRow(
  kind: ApprovalKind,
  action: AssistAction,
  scope: ApprovalScope,
): boolean {
  if (ROW_FAMILY_ACTION_KIND[familyOf(kind)] !== action.kind) return false;
  if (kind.rendersRow) return kind.rendersRow(action, scope);
  // The ONE default recogniser, and it exists only in this family: the kind's
  // id IS the producer's `proposalKind`.
  if (action.kind === "approval_proposal") return kind.id === action.proposalKind;
  // A kind reading another family MUST declare `rendersRow`. Guessing "yes" is
  // the finding this file was rewritten for.
  return false;
}

/** Where this kind would show this row, if it reads it anywhere. */
function kindPlacesRow(
  kind: ApprovalKind,
  action: AssistAction,
): (ApprovalRowPlace & { kind: ApprovalKind }) | null {
  if (ROW_FAMILY_ACTION_KIND[familyOf(kind)] !== action.kind) return null;
  if (kind.rowElsewhere) {
    const place = kind.rowElsewhere(action);
    return place ? { kind, ...place } : null;
  }
  if (action.kind !== "approval_proposal") return null;
  if (kind.id !== action.proposalKind) return null;
  const requirement = kind.scopeRequirement;
  return requirement
    ? { kind, explain: requirement.explain, where: requirement.where }
    : null;
}

/**
 * WILL THIS ROW RENDER in a queue mounting exactly `question.kinds`, standing at
 * `question.scope`?
 *
 * `row` is an assist's raw `action` (a `Json` from the store or an already
 * narrowed action — both are accepted, because the badge reads two columns and
 * the list reads whole rows).
 */
export function willRenderRow(
  row: unknown,
  question: RenderQuestion,
): RenderVerdict {
  const action = narrowAction(row);
  if (!action) {
    return {
      renders: false,
      why: "its action is written in a shape this build cannot read",
      elsewhere: null,
    };
  }
  return willRenderAction(action, question);
}

/**
 * The same question asked about an action that is ALREADY NARROWED — what a read
 * through the assists service hands back. Narrowing twice is not free and, worse,
 * a narrowed shape is not always a valid input to its own narrower.
 */
export function willRenderAction(
  action: AssistAction,
  question: RenderQuestion,
): RenderVerdict {
  const { kinds, scope } = question;
  const allKinds = question.allKinds ?? kinds;

  const here = kinds.find((kind) => kindRendersRow(kind, action, scope));
  if (here) {
    return {
      renders: true,
      kind: here,
      family: familyOf(here),
      proposalKind: here.id,
    };
  }

  // Not here. Does anything, anywhere, show this row? The answer is the door.
  const elsewhere =
    allKinds.flatMap((kind) => {
      const place = kindPlacesRow(kind, action);
      return place ? [place] : [];
    })[0] ?? null;
  const named =
    action.kind === "approval_proposal"
      ? `the proposal kind "${action.proposalKind}"`
      : `a "${action.kind}" row`;
  return {
    renders: false,
    why: elsewhere
      ? `${named} renders on another queue, not on this one (${elsewhere.explain})`
      : `no registered kind renders ${named} on this queue`,
    elsewhere,
  };
}

/**
 * THE KINDS THIS MOUNT CAN READ — the same filter the queue applies before it
 * renders a section, so the badge counts exactly the rows the screen will show.
 *
 * A kind that declares a `scopeRequirement` the mount does not carry is NOT
 * mounted (the queue names it and links where its proposals live instead —
 * never a silent omission).
 */
export function mountedApprovalKinds(
  kinds: readonly ApprovalKind[],
  scope: ApprovalScope,
): readonly ApprovalKind[] {
  return kinds.filter(
    (kind) =>
      kind.scopeRequirement === undefined ||
      Boolean(scope[kind.scopeRequirement.field]),
  );
}

/**
 * LOUD ONCE, never silent: a row the predicate refuses is a developer's defect
 * (a kind registered on one side of the repo boundary only), and the person on
 * the screen must not be told a number that includes it.
 *
 * De-duplicated per row and reason so a refetch loop cannot bury the console.
 */
const alreadyWarned = new Set<string>();

export function warnNotRendered(
  rowId: string,
  verdict: Extract<RenderVerdict, { renders: false }>,
  where: string,
): void {
  const key = `${rowId}|${verdict.why}`;
  if (alreadyWarned.has(key)) return;
  alreadyWarned.add(key);
  console.warn(
    `[approvals] pending row ${rowId} is not rendered by ${where}: ${verdict.why} — it is NOT counted anywhere on screen. Register the kind (features/approvals/registry.ts) or stop producing it.`,
  );
}

/** Test-only: forget what has been warned about. */
export function __resetRenderWarningsForTests(): void {
  alreadyWarned.clear();
}
