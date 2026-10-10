// features/education/convert/sectionJournal.ts
//
// A SECTION THAT RAN ON THE SERVER IS NEVER PAID FOR TWICE (2026-10-03).
//
// A segmented generation (`segmentedGenerate.ts`) is many agent calls. Each
// call runs on the server, and the server keeps going when the tab closes
// (every agent stream detaches on disconnect) and stores the answer in the
// call's conversation. What died with the tab was only the browser's merge and
// save — so a reload used to throw away every finished section and pay for
// all of them again, or (before the kit had a run marker) throw away the kit.
//
// The journal is the receipt book: the id of the conversation each section
// ran in, kept by the caller (the study kit keeps it in its tab-bound run
// marker — `lib/wizard-draft/useTabBoundRun.ts`). A retry over the SAME plan
// reads each recorded section back from the server instead of running it:
// finished → its answer; still running → waited for; failed or never reached
// the server → run again. The browser holds ids only; the answers are the
// server's.

import { extractFirstJson } from "@ai-matrx/content-ir/json-extract";
import { createClient } from "@/utils/supabase/client";
import { fetchRunFinalResponse } from "@/features/agents/samples/service";
import type { TargetKind } from "./types";

/** The receipt book a segmented generation writes to and reads from. */
export interface SectionJournal {
  /** Sections of this plan that already have a run (segment id → conversation id). */
  recorded(planKey: string): Readonly<Record<string, string>>;
  /** A section's run now exists on the server. */
  started(planKey: string, segmentId: string, conversationId: string): void;
  /**
   * Names THIS kit run across a reload (kit + the first attempt's start). An
   * artifact created by the run is stamped with it so a resumed run adopts the
   * artifact instead of making a second one or leaving it outside the kit.
   */
  runScope?: string;
}

/** FNV-1a over the text — the plan is only reusable for the exact same material. */
export function textFingerprint(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * The identity of one target's plan. Sections are numbered within a plan, so a
 * recorded section only answers for the same target, the same material and
 * the same split (segment count and total); anything else runs fresh.
 */
export function sectionPlanKey(
  targetKind: TargetKind,
  text: string,
  plan: { segments: readonly unknown[]; total: number },
): string {
  return `${targetKind}:${textFingerprint(text)}:${plan.segments.length}:${plan.total}`;
}

/** Request statuses after which the run will never answer. */
const NEVER_ANSWERS = new Set(["failed", "cancelled", "abandoned", "paused"]);

/** How often a still-running recorded section is looked at again. */
const RECOVER_POLL_MS = 3_000;
/**
 * A recorded conversation with no request row this long is a call the server
 * never received (the tab closed between creating the conversation and
 * sending the call).
 */
const NO_REQUEST_GRACE_MS = 8_000;

async function latestRequestStatus(conversationId: string): Promise<string | null> {
  const { data, error } = await createClient()
    .schema("chat")
    .from("user_request")
    .select("status")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.status ?? null;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * Read one recorded section's answer back from the server: its extracted JSON
 * once its run finished, or null when it will never answer (failed, never
 * reached the server, unreadable, past `deadlineMs`) and must be run again.
 * Never throws — a failed read is a section to run, not a broken kit.
 */
export async function recoverSectionValue(
  conversationId: string,
  opts: { deadlineMs: number; signal?: AbortSignal },
): Promise<unknown | null> {
  const start = Date.now();
  try {
    for (;;) {
      if (opts.signal?.aborted) return null;
      const status = await latestRequestStatus(conversationId);
      const waited = Date.now() - start;
      if (status === "completed") {
        const text = await fetchRunFinalResponse(conversationId);
        if (!text) return null;
        return extractFirstJson(text, { allowFuzzy: true })?.value ?? null;
      }
      if (status !== null && NEVER_ANSWERS.has(status)) return null;
      if (status === null && waited > NO_REQUEST_GRACE_MS) return null;
      if (waited > opts.deadlineMs) return null;
      await sleep(RECOVER_POLL_MS, opts.signal);
    }
  } catch (err) {
    console.warn(
      `[convert/sectionJournal] could not read section run ${conversationId} back — running it again:`,
      err,
    );
    return null;
  }
}
