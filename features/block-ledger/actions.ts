"use client";

// features/block-ledger/actions.ts
//
// The two things a person does with a block: run it again, or hand it to their own
// browser. Both are WRITES, so both go through aidream — the client never invents a
// second door past the ladder law, the per-rung knobs or the Library landing.
//
// 🚨 EVERY OUTCOME IS A SENTENCE. A bulk action that half-worked says how many, which
// half, and the first reason given. A capability the server does not have yet says so
// in plain words and calls it ours to fix — never a red error a person would try to
// solve (`common-docs/policies/...` fourth law: a screen is absent or honest).

import { BackendApiError } from "@/lib/api/errors";
import { postJson, postNdjson } from "@/lib/python-client";
import { supabase } from "@/utils/supabase/client";
import { CAPTURE_HANDOFFS_PATH } from "@/features/capture-ladder/sendToOwnBrowser";
import { ENDPOINTS } from "@/lib/api/endpoints";
import type { AcquisitionBlock } from "./types";
import { canGoToYourBrowser, isRetryable } from "./types";

export interface BlockActionOutcome {
  sentence: string;
  /** True when the list should re-read itself — counts and statuses moved. */
  refresh: boolean;
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? `1 ${one}` : `${n} ${many}`;
}

/**
 * RETRY — run the blocked inputs back through the ladder, from rung 1.
 *
 * This is not a "mark as fixed" button: it really re-fetches, through the same
 * `/scraper/quick-scrape` the batch screen uses, which means the ladder runs, the
 * server browser escalates if it can, and anything that fails again lands back in
 * this register with its count one higher. Nothing here writes a verdict — the
 * engines do.
 *
 * Blocks whose only lawful route crosses DRM, a paywall, someone else's login or a
 * permission we never requested are NOT retried. Re-running those would spend the
 * organization's quota to reproduce the same refusal, so they are reported as
 * skipped, by name.
 */
export async function retryBlocks(
  rows: AcquisitionBlock[],
): Promise<BlockActionOutcome> {
  const retryable = rows.filter(isRetryable);
  const skipped = rows.length - retryable.length;
  const webPages = retryable.filter(
    (row) => row.source_type === "web_page" && /^https?:\/\//.test(row.input_ref),
  );
  const notAddressable = retryable.length - webPages.length;

  if (webPages.length === 0) {
    return {
      sentence:
        skipped > 0
          ? `Nothing was retried. ${plural(skipped, "block needs", "blocks need")} a decision rather than another attempt, and the rest are not web addresses this server can fetch again on its own.`
          : "Nothing was retried: none of these is a web address the server can fetch again on its own. A file or a connected account is fixed where it came from, not by another attempt.",
      refresh: false,
    };
  }

  await markRetrying(webPages.map((row) => row.id));

  let readable = 0;
  let stillBlocked = 0;
  try {
    for await (const event of postNdjson<{ urls: string[] }>(
      ENDPOINTS.scraper.quickScrape,
      { urls: webPages.map((row) => row.input_ref) },
    )) {
      // The stream's shape belongs to the scraper, not to this register; all
      // this action needs is the tally, and the ledger itself is re-read after.
      const record = event as unknown as Record<string, unknown>;
      const data = (record.data ?? record) as Record<string, unknown>;
      if (typeof data.success === "boolean") {
        if (data.success) readable += 1;
        else stillBlocked += 1;
      }
    }
  } catch (error) {
    const said =
      error instanceof BackendApiError
        ? error.userMessage || error.detail
        : error instanceof Error
          ? error.message
          : "";
    return {
      sentence: said
        ? `The retry stopped: ${said} The blocks are unchanged.`
        : "The retry stopped and the server did not say why. The blocks are unchanged — you can press it again.",
      refresh: true,
    };
  }

  const parts = [
    `Ran ${plural(webPages.length, "page", "pages")} through the ladder again.`,
  ];
  if (readable > 0) parts.push(`${readable} came back readable.`);
  if (stillBlocked > 0)
    parts.push(
      `${stillBlocked} hit the same wall — those rows now show one more occurrence.`,
    );
  if (notAddressable > 0)
    parts.push(
      `${plural(notAddressable, "block was", "blocks were")} left alone: not a web address.`,
    );
  if (skipped > 0)
    parts.push(
      `${plural(skipped, "block needs", "blocks need")} a decision, not another attempt, so ${skipped === 1 ? "it was" : "they were"} skipped.`,
    );

  return { sentence: parts.join(" "), refresh: true };
}

/**
 * SEND TO MY BROWSER — hand the page to the extension's rung.
 *
 * The endpoint is the capture ladder's own (`POST /capture/handoffs`). When that
 * lane's server half is not on this deployment yet, the 404 is answered with the
 * plain sentence rather than a red error: the person did nothing wrong and there
 * is nothing for them to do.
 */
export async function sendBlocksToOwnBrowser(
  rows: AcquisitionBlock[],
): Promise<BlockActionOutcome> {
  const eligible = rows.filter(canGoToYourBrowser);
  const skipped = rows.length - eligible.length;

  if (eligible.length === 0) {
    return {
      sentence:
        "None of these is a page your own browser could read. A browser beats a sign-in, a paywall or a bot wall — it does not beat a missing file, a DRM-protected book or a permission we never asked for.",
      refresh: false,
    };
  }

  try {
    const { data } = await postJson<{
      created?: unknown[];
      refused?: Array<{ url?: string; why?: string }>;
    }>(CAPTURE_HANDOFFS_PATH, {
      urls: eligible.map((row) => row.input_ref),
    });

    const queued = Array.isArray(data?.created)
      ? data.created.length
      : eligible.length;
    const refusedRows = Array.isArray(data?.refused) ? data.refused : [];

    const parts = [
      `${plural(queued, "page is", "pages are")} now waiting for your browser. Open the Matrx extension and it will read ${queued === 1 ? "it" : "them"}.`,
    ];
    if (refusedRows.length > 0)
      parts.push(
        `${plural(refusedRows.length, "was", "were")} not queued — the first reason given was “${refusedRows[0]?.why ?? "no reason given"}”.`,
      );
    if (skipped > 0)
      parts.push(
        `${plural(skipped, "block", "blocks")} in your selection ${skipped === 1 ? "is" : "are"} not something a browser can beat, so ${skipped === 1 ? "it was" : "they were"} left alone.`,
      );

    return { sentence: parts.join(" "), refresh: true };
  } catch (error) {
    if (error instanceof BackendApiError && error.status === 404) {
      return {
        sentence:
          "Sending pages to your own browser is not switched on for this server yet, so nothing was queued. Nothing for you to do — this one is ours.",
        refresh: false,
      };
    }
    const said =
      error instanceof BackendApiError
        ? error.userMessage || error.detail
        : error instanceof Error
          ? error.message
          : "";
    return {
      sentence: said
        ? `Nothing was queued: ${said}`
        : "Nothing was queued and the server did not say why. Nothing was lost — you can press it again.",
      refresh: false,
    };
  }
}

/** Say out loud that a retry is running, so the list never looks idle mid-action. */
async function markRetrying(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .schema("platform")
    // @ts-expect-error — the register is read and written by name; see service.ts
    .from("acquisition_block")
    .update({ status: "retrying", last_retry_at: new Date().toISOString() } as never)
    .in("id", ids);
  // A status stamp that did not land is not worth failing a retry over — the
  // retry itself is the thing the person asked for, and the engines write the
  // real verdict. It is still said out loud rather than swallowed.
  if (error) console.warn("block ledger: could not mark rows retrying", error);
}
