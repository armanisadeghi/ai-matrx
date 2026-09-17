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
 * So there is ONE function. A row renders when the mount carries a kind that
 * READS ITS ACTION SHAPE and that kind's own `id` matches the row — action
 * narrowing AND kind registration, in one place. Everything that reports a
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
       * Set when SOME registered kind reads this row but this mount does not
       * carry it — the row is real and waiting, just not in this list.
       */
      elsewhere: ApprovalKind | null;
    };

/**
 * WILL THIS ROW RENDER in a queue mounting exactly `kinds`?
 *
 * `row` is an assist's raw `action` (a `Json` from the store or an already
 * narrowed action — both are accepted, because the badge reads two columns and
 * the list reads whole rows).
 *
 * `allKinds` is THE registry, used only to answer "some kind reads this, just
 * not here" — the door a deep link needs. Omit it and a refusal simply carries
 * no elsewhere.
 */
export function willRenderRow(
  row: unknown,
  kinds: readonly ApprovalKind[],
  allKinds: readonly ApprovalKind[] = kinds,
): RenderVerdict {
  const action = narrowAction(row);
  if (!action) {
    return {
      renders: false,
      why: "its action is written in a shape this build cannot read",
      elsewhere: null,
    };
  }
  return willRenderAction(action, kinds, allKinds);
}

/**
 * The same question asked about an action that is ALREADY NARROWED — what a read
 * through the assists service hands back. Narrowing twice is not free and, worse,
 * a narrowed shape is not always a valid input to its own narrower.
 */
export function willRenderAction(
  action: AssistAction,
  kinds: readonly ApprovalKind[],
  allKinds: readonly ApprovalKind[] = kinds,
): RenderVerdict {
  const matches = (candidates: readonly ApprovalKind[]) =>
    candidates.filter(
      (kind) => ROW_FAMILY_ACTION_KIND[familyOf(kind)] === action.kind,
    );

  if (action.kind === "approval_proposal") {
    const proposalKind = action.proposalKind;
    const here = matches(kinds).find((kind) => kind.id === proposalKind);
    if (here) {
      return {
        renders: true,
        kind: here,
        family: "approval_proposal",
        proposalKind,
      };
    }
    const anywhere =
      matches(allKinds).find((kind) => kind.id === proposalKind) ?? null;
    return {
      renders: false,
      why: anywhere
        ? `the kind "${proposalKind}" that renders it is not mounted on this queue`
        : `no registered kind renders the proposal kind "${proposalKind}"`,
      elsewhere: anywhere,
    };
  }

  // Every other action shape a kind may read (today: the keyword kinds').
  const here = matches(kinds);
  if (here.length > 0 && here[0]) {
    return {
      renders: true,
      kind: here[0],
      family: familyOf(here[0]),
      proposalKind: here[0].id,
    };
  }
  const anywhere = matches(allKinds);
  return {
    renders: false,
    why: anywhere.length > 0
      ? `the kinds that read "${action.kind}" rows are not mounted on this queue`
      : `no registered kind renders a "${action.kind}" row`,
    elsewhere: anywhere[0] ?? null,
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
