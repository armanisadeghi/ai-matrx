// features/masterwork/sorting/service.ts
//
// THE SORTING TABLE's three calls, and nothing else.
//
// NEITHER of the two streaming calls is a durable run — deliberately, and the
// reason is different for each:
//
//   * WRITING A ROUND writes nothing to the Rulebook. An unsorted case is not
//     expertise; a lost round costs one cheap call and the door re-writes it in
//     one tap. A durable row for it would be a ledger entry for a thing that
//     produced nothing.
//   * ANSWERING A BOUNDARY QUESTION is one mandate call and one CAS write,
//     submitted the moment the Expert stops speaking — seconds, not minutes.
//     The server finishes it even if the tab goes away
//     (`detach_on_disconnect`), and an answer whose receipt never came back is
//     reported ON THE QUESTION with a Try again, never swallowed.
//
// The third call, the boundary pass, is not a stream at all: it is pure
// arithmetic on the server (no model, no money, no write), so there is nothing
// to wait for.
//
// If any of them ever grows into a multi-minute pipeline it moves onto
// `useMasterworkRun` like every other Masterwork lane, and this comment is the
// reason it has not.

import { callApi } from "@/lib/api/call-api";
import { dbAuthoredMandateKey } from "@/features/mandates/mandate-key";
import type { AppStore } from "@/lib/redux/store";
import type { paths } from "@/types/python-generated/api-types";
import {
  parseBoundaryQuestions,
  parseRound,
  type BoundaryQuestion,
  type SortCase,
  type SortIngestSummary,
  type SortPile,
  type SortRound,
} from "./types";

export const SORT_CASES_PATH = "/masterworks/sort/cases" satisfies keyof paths;
export const SORT_BOUNDARY_PATH = "/masterworks/sort/boundary" satisfies keyof paths;
export const SORT_INGEST_PATH = "/masterworks/ingest-sort" satisfies keyof paths;

/** The feature these knobs belong to — registered by migration 0745. */
export const SORT_KNOB_FEATURE = "masterwork.sorting_table";

/**
 * The values the knobs START at, declared here so a missing row degrades into a
 * VISIBLE warning rather than a broken screen. NOT a fallback the system
 * settles into: the banner names the problem every time it is used.
 *
 * The server reads the same knobs for itself and is the authority on the round
 * it writes and the questions it asks; these are what this screen lays out
 * BEFORE the first call, when there is nothing to have been told yet.
 */
export const DECLARED_KNOB_DEFAULTS = {
  cases_per_round: 20,
  piles: 3,
  boundary_questions_per_round: 5,
  voice_default_on: true,
};

/**
 * The Mandate behind each half — shown to the Expert by `AgentCredit`.
 *
 * Both are REAL `origin='code'` rows aidream declared on 2026-09-15 (verified
 * live 2026-09-17), but the installed `@ai-matrx/agents` predates them, so the
 * generated union cannot carry them yet. `dbAuthoredMandateKey` is the typed
 * door for exactly that case (V-L6a, 2026-09-17): the literal stays visible to
 * `pnpm check:mandate-keys`, which is why `scripts/mandate-keys-allowlist.json`
 * carries a reason for each — and nothing here is typed `string`. Swap both for
 * `MANDATE_KEYS.masterwork__sort_case_writer` / `__sort_distiller` and delete
 * the allowlist rows once the package republishes.
 */
export const SORT_CASE_WRITER_MANDATE = dbAuthoredMandateKey(
  "masterwork.sort_case_writer",
);
export const SORT_DISTILLER_MANDATE = dbAuthoredMandateKey(
  "masterwork.sort_distiller",
);

function eventData(event: unknown): Record<string, unknown> | null {
  const data = (event as { data?: unknown } | null)?.data;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

/**
 * Write a round of cases for an Expert who brought none.
 *
 * `seenCases` is every case this sitting has already sorted. The server drops a
 * repeat and says how many it dropped; the session is the only thing that knows
 * what it has shown, so it is the session that must say.
 */
export async function writeSortCases(
  store: AppStore,
  {
    rulebookId,
    count,
    pileNames,
    seenCases,
  }: {
    rulebookId: string;
    count?: number;
    pileNames: string[];
    seenCases: string[];
  },
): Promise<SortRound> {
  let round: SortRound | null = null;
  await store.dispatch(
    callApi({
      path: SORT_CASES_PATH,
      method: "POST",
      // 🚨 `stream: true` IS WHAT MAKES `onStreamEvent` EXIST. Without it
      // `callApi` buffers the body and never calls the handler, so the round
      // arrives on the wire, is thrown away, and the screen says the cases did
      // not come back — a lie, after a paid call. Found live on the Triad lane
      // 2026-09-15 and guarded by
      // `lib/api/__tests__/stream-handlers-need-the-stream-flag.test.ts`.
      stream: true,
      body: {
        rulebook_id: rulebookId,
        ...(count ? { count } : {}),
        pile_names: pileNames,
        seen_cases: seenCases,
      } as never,
      onStreamEvent: (event) => {
        const data = eventData(event);
        if (data?.type === "masterwork_sort_cases_ready") round = parseRound(data);
      },
    }),
  );
  if (!round) {
    // NOTHING FAILS SILENTLY: a stream that ended without the payload is a
    // failure with a remedy, never an empty table.
    throw new Error(
      "The cases didn't come back. Nothing was lost — try again, or paste your own in.",
    );
  }
  return round;
}

/**
 * The sorted piles → the questions worth asking. Pure arithmetic server-side.
 *
 * `assignments` carries ONLY the cases the Expert actually sorted. A skipped
 * case is not a judgment and must never turn up inside a boundary pair.
 */
export async function findBoundary(
  store: AppStore,
  {
    rulebookId,
    cases,
    piles,
    assignments,
  }: {
    rulebookId: string;
    cases: SortCase[];
    piles: SortPile[];
    assignments: Record<string, string>;
  },
): Promise<BoundaryQuestion[]> {
  const response = await store.dispatch(
    callApi({
      path: SORT_BOUNDARY_PATH,
      method: "POST",
      body: {
        rulebook_id: rulebookId,
        cases: cases.map((entry) => ({
          id: entry.id,
          text: entry.text,
          note: entry.note,
        })),
        piles: piles.map((pile) => ({ key: pile.key, name: pile.name })),
        assignments,
      } as never,
    }),
  );
  if (response.error) {
    // NOTHING FAILS SILENTLY: a refused boundary pass is a failure with a
    // remedy, never a round that quietly reports no edges.
    throw new Error(
      response.error.message ||
        "We couldn't work out the boundary for this round. Nothing was lost — try again.",
    );
  }
  return parseBoundaryQuestions(response.data);
}

/** Distil ONE answered boundary question. Resolves with what it added. */
export async function ingestSortAnswer(
  store: AppStore,
  {
    rulebookId,
    question,
    reason,
  }: {
    rulebookId: string;
    question: BoundaryQuestion;
    reason: string;
  },
): Promise<SortIngestSummary> {
  let summary: SortIngestSummary | null = null;
  await store.dispatch(
    callApi({
      path: SORT_INGEST_PATH,
      method: "POST",
      // Same law as the round above: no flag, no events, no receipt.
      stream: true,
      body: {
        rulebook_id: rulebookId,
        question: {
          id: question.id,
          kind: question.kind,
          prompt: question.prompt,
          left_case: question.leftCase,
          left_case_id: question.leftCaseId,
          left_pile: question.leftPile,
          right_case: question.rightCase,
          right_case_id: question.rightCaseId,
          right_pile: question.rightPile,
          empty_pile: question.emptyPile,
          closeness: question.closeness,
          pile_names: question.pileNames,
        },
        reason,
      } as never,
      onStreamEvent: (event) => {
        const data = eventData(event);
        if (data?.type !== "masterwork_ingest_complete") return;
        const already = data.already_distilled;
        summary = {
          added: typeof data.added === "number" ? data.added : 0,
          quotesVerified:
            typeof data.quotes_verified === "number" ? data.quotes_verified : 0,
          quotesUnverified:
            typeof data.quotes_unverified === "number"
              ? data.quotes_unverified
              : 0,
          alreadyAnswered: Array.isArray(already) && already.length > 0,
        };
      },
    }),
  );
  if (!summary) {
    throw new Error(
      "We didn't get an answer back for that one. It may still have saved — " +
        "open the Rulebook to check, or answer it again.",
    );
  }
  return summary;
}
