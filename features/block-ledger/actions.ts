"use client";

// features/block-ledger/actions.ts
//
// The two things a person does with a block: run it again, or hand it to their own
// browser. Both are WRITES, and every write on this surface goes to aidream.
//
// 🚨 THIS FILE PERFORMS NO DATABASE WRITE, AND MUST NEVER GROW ONE.
// `platform.acquisition_block` is the `ledger` variant: 33 of this database's 40
// active ledger tables give `authenticated` SELECT and nothing else, because a
// ledger's rows are the server's account of what happened. The first version of
// this file marked rows `retrying` with supabase-js and got
// `42501 permission denied for table acquisition_block` on EVERY press — silently,
// into the console, where nobody saw it until an independent verifier pressed the
// button for the first time (2026-09-18). The fix was not the grant the error
// invites; it was moving the write behind the server, which is where it now lives
// (`aidream/api/routers/block_ledger.py`, `POST /blocks/retry` and
// `POST /blocks/handoffs`). Guard: `pnpm check:client-writes-are-granted`.
//
// 🚨 EVERY OUTCOME IS A SENTENCE, AND IT IS THE SERVER'S. The endpoints answer with
// the sentence they want a person to read — how many ran, how many came back, what
// was left alone and why. This file does not compose a second one that could
// disagree with the rows the server just wrote.

import { BackendApiError } from "@/lib/api/errors";
import { postJson } from "@/lib/python-client";
import type { AcquisitionBlock } from "./types";

export interface BlockActionOutcome {
  sentence: string;
  /** True when the list should re-read itself — rows moved. */
  refresh: boolean;
}

interface RetryResponse {
  retried?: number;
  readable?: number;
  still_blocked?: number;
  refused?: Array<{ block_id?: string; why?: string }>;
  sentence?: string;
}

interface HandoffResponse {
  queued?: number;
  batch_id?: string | null;
  refused?: Array<{ block_id?: string; why?: string }>;
  sentence?: string;
}

/** What a failed call says, always in words, never a bare code. */
function refusalSentence(error: unknown, whenAbsent: string): string {
  if (error instanceof BackendApiError && error.status === 404) {
    return (
      "This server does not have the block actions switched on yet, so nothing " +
      "was changed. Nothing for you to do — this one is ours."
    );
  }
  const said =
    error instanceof BackendApiError
      ? error.userMessage || error.detail
      : error instanceof Error
        ? error.message
        : "";
  return said ? `${whenAbsent} ${said}` : whenAbsent;
}

/**
 * RETRY — run the blocked inputs back through the ladder, from rung 1.
 *
 * The server really re-fetches, spends the organization's scraping budget, and writes
 * the outcome onto each row it touched: the attempt before it runs, `resolved` when
 * the wall is gone, and back to `open` when it is not. Anything that hits a wall
 * again is recorded by the ledger's own seam while the scrape runs.
 */
export async function retryBlocks(
  rows: AcquisitionBlock[],
): Promise<BlockActionOutcome> {
  if (rows.length === 0) {
    return { sentence: "Nothing was selected, so nothing was retried.", refresh: false };
  }
  try {
    const { data } = await postJson<RetryResponse>("/blocks/retry", {
      block_ids: rows.map((row) => row.id),
    });
    return {
      sentence: data?.sentence || "The retry ran.",
      // Even a run that retried nothing may have refused things worth re-reading.
      refresh: true,
    };
  } catch (error) {
    return {
      sentence: refusalSentence(
        error,
        "Nothing was retried and the blocks are unchanged.",
      ),
      refresh: false,
    };
  }
}

/**
 * SEND TO MY BROWSER — hand the page to the extension's rung.
 *
 * The server queues through the capture ladder's own `enqueue` (one door, one place
 * the ladder law lives) and then names the new handoff on the block it came from, so
 * the row can be followed afterwards instead of guessed at.
 */
export async function sendBlocksToOwnBrowser(
  rows: AcquisitionBlock[],
): Promise<BlockActionOutcome> {
  if (rows.length === 0) {
    return { sentence: "Nothing was selected, so nothing was queued.", refresh: false };
  }
  try {
    const { data } = await postJson<HandoffResponse>("/blocks/handoffs", {
      block_ids: rows.map((row) => row.id),
    });
    return {
      sentence: data?.sentence || "The pages were sent to your browser.",
      refresh: true,
    };
  } catch (error) {
    return {
      sentence: refusalSentence(error, "Nothing was queued."),
      refresh: false,
    };
  }
}
