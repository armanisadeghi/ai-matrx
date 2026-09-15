// features/masterwork/triad/service.ts
//
// THE TRIAD GAME's two calls, and nothing else.
//
// Both stream (aidream streams anything over a second), and NEITHER is a
// durable run — deliberately, and the reason is different for each:
//
//   * DEALING writes nothing. A generated card is a QUESTION; a lost deck costs
//     one cheap call and the door re-deals in one tap. A durable row for it
//     would be a ledger entry for a thing that produced nothing.
//   * ANSWERING is one mandate call and one CAS write, submitted the moment the
//     Expert swipes — seconds, not minutes. The server finishes it even if the
//     tab goes away (`detach_on_disconnect`), and a card whose receipt never
//     came back is reported ON THE CARD with a Try again, never swallowed.
//
// If either ever grows into a multi-minute pipeline it moves onto
// `useMasterworkRun` like every other Masterwork lane, and this comment is the
// reason it has not.

import { callApi } from "@/lib/api/call-api";
import type { AppStore } from "@/lib/redux/store";
import type { paths } from "@/types/python-generated/api-types";
import { parseDeck, type Triad, type TriadDeck, type TriadIngestSummary, type TriadMode } from "./types";

export const TRIAD_DEAL_PATH = "/masterworks/triads" satisfies keyof paths;
export const TRIAD_INGEST_PATH = "/masterworks/ingest-triad" satisfies keyof paths;

/** The Mandate behind each half — shown to the Expert by `AgentCredit`. */
export const TRIAD_GENERATOR_MANDATE = "masterwork.triad_generator";
export const TRIAD_DISTILLER_MANDATE = "masterwork.triad_distiller";

function eventData(event: unknown): Record<string, unknown> | null {
  const data = (event as { data?: unknown } | null)?.data;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
}

/**
 * Deal the next round.
 *
 * `seenPrompts` is every card question this sitting has already shown. The
 * server drops a repeat and says how many it dropped; the session is the only
 * thing that knows what it has shown, so it is the session that must say.
 */
export async function dealTriads(
  store: AppStore,
  {
    rulebookId,
    count,
    mode,
    seenPrompts,
  }: {
    rulebookId: string;
    count?: number;
    mode?: TriadMode;
    seenPrompts: string[];
  },
): Promise<TriadDeck> {
  let deck: TriadDeck | null = null;
  await store.dispatch(
    callApi({
      path: TRIAD_DEAL_PATH,
      method: "POST",
      // 🚨 `stream: true` IS WHAT MAKES `onStreamEvent` EXIST. Without it
      // `callApi` buffers the body and never calls the handler, so the deck
      // arrives on the wire, is thrown away, and the screen says the cards did
      // not come back — a lie, after a paid call. Found live 2026-09-15 and
      // guarded by `lib/api/__tests__/stream-handlers-need-the-stream-flag.test.ts`.
      stream: true,
      // 🚨 `stream: true` IS WHAT MAKES `onStreamEvent` EXIST. Without it
      // `callApi` buffers the body and never calls the handler, so the deck
      // arrives on the wire, is thrown away, and the screen says the cards did
      // not come back — a lie, after a paid call. Found live 2026-09-15 and
      // guarded by `lib/api/__tests__/stream-handlers-need-the-stream-flag.test.ts`.
      body: {
        rulebook_id: rulebookId,
        ...(count ? { count } : {}),
        ...(mode ? { mode } : {}),
        seen_prompts: seenPrompts,
      } as never,
      onStreamEvent: (event) => {
        const data = eventData(event);
        if (data?.type === "masterwork_triads_ready") deck = parseDeck(data);
      },
    }),
  );
  if (!deck) {
    // NOTHING FAILS SILENTLY: a stream that ended without the payload is a
    // failure with a remedy, never an empty board.
    throw new Error(
      "The cards didn't come back. Nothing was lost — try dealing again.",
    );
  }
  return deck;
}

/** Distil ONE answered card. Resolves with what it added. */
export async function ingestTriadAnswer(
  store: AppStore,
  {
    rulebookId,
    triad,
    pick,
    reason,
  }: {
    rulebookId: string;
    triad: Triad;
    pick: Triad["items"][number]["key"];
    reason: string;
  },
): Promise<TriadIngestSummary> {
  let summary: TriadIngestSummary | null = null;
  await store.dispatch(
    callApi({
      path: TRIAD_INGEST_PATH,
      method: "POST",
      // Same law as the deal above: no flag, no events, no receipt.
      stream: true,
      body: {
        rulebook_id: rulebookId,
        triad: {
          id: triad.id,
          prompt: triad.prompt,
          mode: triad.mode,
          items: triad.items.map((item) => ({
            key: item.key,
            text: item.text,
            note: item.note,
          })),
        },
        pick,
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
          alreadyPlayed: Array.isArray(already) && already.length > 0,
        };
      },
    }),
  );
  if (!summary) {
    throw new Error(
      "We didn't get an answer back for that one. It may still have saved — " +
        "open the Rulebook to check, or play it again.",
    );
  }
  return summary;
}
