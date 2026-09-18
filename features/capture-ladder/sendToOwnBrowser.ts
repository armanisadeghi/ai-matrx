"use client";

/**
 * features/capture-ladder/sendToOwnBrowser.ts
 *
 * "Send the rest to my browser" — the ONE write path. CONTRACT.md §4 and §8.2.
 *
 * 🚨 THIS IS A WRITE, SO IT GOES THROUGH AIDREAM. Reads of
 * `media.capture_handoff` go direct to Postgres (see `captureHandoffTable.ts`);
 * writes deliberately do not. `POST /capture/handoffs` is where the ladder law,
 * the per-rung settings knobs and the Library landing are enforced, and a
 * client that inserted its own rows would be a second door past all three.
 *
 * It uses `postJson` from `lib/python-client.ts` — the repo's existing aidream
 * server-call helper, which attaches the Supabase JWT, the `X-Organization-Id`
 * header, a per-mutation `X-Request-Id`, and turns a failure into a
 * `BackendApiError` carrying the platform envelope's sentence. A hand-rolled
 * `fetch` here would have none of that, starting with the org header, and an
 * org-less handoff insert is refused by the server anyway.
 *
 * ⚠️ NOT LIVE YET at the time of writing (2026-09-17). The `/capture/*`
 * endpoints are being built by a sibling aidream lane; this is written against
 * CONTRACT.md §4, not against a response anybody has seen. That is why
 * `sendUrlsToOwnBrowser` treats a 404 as its own named outcome with its own
 * sentence: the day before the server half deploys, a person pressing this
 * button must be told "this is not switched on yet", not shown a red error they
 * will try to fix.
 */

import { postJson } from "@/lib/python-client";
import { BackendApiError } from "@/lib/api/errors";
import {
  selectOwnBrowserUrls,
  type LadderCandidate,
} from "@/features/capture-ladder/ladderOutcome";

/** CONTRACT.md §4, `POST /capture/handoffs`. */
export const CAPTURE_HANDOFFS_PATH = "/capture/handoffs";

export interface CreateHandoffsBody {
  urls: string[];
  reason?: string;
  batch_id?: string;
  library_id?: string;
}

/** The §4 response, read defensively — the endpoint is not live yet. */
export interface CreateHandoffsResponse {
  batch_id?: string;
  created?: unknown[];
  refused?: Array<{ url?: string; why?: string }>;
}

export type SendToOwnBrowserResult =
  | { kind: "sent"; queued: number; refused: number; sentence: string }
  | { kind: "nothing_to_send"; sentence: string }
  | { kind: "not_available"; sentence: string }
  | { kind: "refused"; sentence: string };

/**
 * Queue every row the SERVER sent to rung 3, and nothing else.
 *
 * The selection is not this function's opinion — it is
 * {@link selectOwnBrowserUrls}, which throws rather than return a row the
 * server did not mark `next_rung === "own_browser"`. That throw is deliberately
 * NOT caught here: it is a defect in the caller's row set, not a condition, and
 * swallowing it is how a skipped rung would reach the queue.
 */
export async function sendUrlsToOwnBrowser(
  rows: readonly LadderCandidate[],
  options: { libraryId?: string; batchId?: string } = {},
): Promise<SendToOwnBrowserResult> {
  const urls = selectOwnBrowserUrls(rows);

  if (urls.length === 0) {
    return {
      kind: "nothing_to_send",
      sentence:
        "Nothing here is waiting for your browser. A page only goes to your browser when the server says your own sign-in is what it needs.",
    };
  }

  const body: CreateHandoffsBody = { urls };
  if (options.libraryId) body.library_id = options.libraryId;
  if (options.batchId) body.batch_id = options.batchId;

  try {
    const { data } = await postJson<CreateHandoffsResponse>(
      CAPTURE_HANDOFFS_PATH,
      body,
    );

    const queued = Array.isArray(data?.created)
      ? data.created.length
      : urls.length;
    const refusedRows = Array.isArray(data?.refused) ? data.refused : [];
    const refused = refusedRows.length;

    const queuedSentence =
      queued === 1
        ? "1 page is now waiting for your browser."
        : `${queued} pages are now waiting for your browser.`;

    return {
      kind: "sent",
      queued,
      refused,
      sentence:
        refused === 0
          ? `${queuedSentence} Open the Matrx extension and it will read them.`
          : `${queuedSentence} ${
              refused === 1 ? "1 was not queued" : `${refused} were not queued`
            } — the first reason given was “${
              refusedRows[0]?.why ?? "no reason given"
            }”.`,
    };
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 404) {
      return {
        kind: "not_available",
        sentence:
          "Sending pages to your own browser is not switched on for this server yet, so nothing was queued. Nothing for you to do — this one is ours.",
      };
    }
    // The platform envelope always carries a sentence; `userMessage` is the
    // one written for a person. Only when there is genuinely no sentence do we
    // fall back — and then we say that too, rather than printing a code.
    const said =
      error instanceof BackendApiError
        ? error.userMessage || error.detail
        : error instanceof Error
          ? error.message
          : "";

    return {
      kind: "refused",
      sentence: said
        ? `Nothing was queued: ${said}`
        : "Nothing was queued and the server did not say why. Nothing was lost — you can press it again.",
    };
  }
}
