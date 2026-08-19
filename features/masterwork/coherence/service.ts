// features/masterwork/coherence/service.ts
//
// Recording how the Expert settled one Coherence question.
//
// 🚨 This writes `metadata.coherence` ONLY and deliberately does NOT bump
// `version` — `version` is the RULES version a Masterwork drifts against, and a
// question ABOUT the rules is not a change to them. Same discipline as the
// server's `_save_tensions` and as `metadata.expert_corpus` / `metadata.elicitation`.
//
// 🚨 It also changes NO rule. If the Expert's answer means a rule should change,
// that is a separate edit that lands as a draft they approve — AI never overwrites
// human-authored work (common-docs/systems/provenance-stamping/FEATURE.md).

import { supabase } from "@/utils/supabase/client";
import type { RulebookRow } from "../types";
import { allTensions, type TensionState } from "./types";

const rulebookTable = () => supabase.schema("platform").from("rulebook");

export type SettleResult =
  | { status: "saved" }
  /** The Rulebook moved under us twice — the caller refetches and retries. */
  | { status: "conflict" }
  | { status: "not_found" };

/**
 * Mark one open question settled, keeping the Expert's own words verbatim.
 *
 * `answer` is stored exactly as typed — never a summary. It is what a LATER
 * session is shown so the partner never re-asks, so paraphrasing it would put
 * words in the Expert's mouth in the one place they are read as theirs.
 */
export async function settleTension(opts: {
  rulebookId: string;
  tensionId: string;
  outcome: Exclude<TensionState, "open">;
  answer?: string;
}): Promise<SettleResult> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await rulebookTable()
      .select("id, version, metadata")
      .eq("id", opts.rulebookId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { status: "not_found" };

    const row = data as Pick<RulebookRow, "id" | "version" | "metadata">;
    const tensions = allTensions({ metadata: row.metadata });
    const match = tensions.find((t) => t.id === opts.tensionId);
    if (!match) return { status: "not_found" };

    const baseMeta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const block =
      baseMeta.coherence &&
      typeof baseMeta.coherence === "object" &&
      !Array.isArray(baseMeta.coherence)
        ? (baseMeta.coherence as Record<string, unknown>)
        : {};
    const answer = opts.answer?.trim();
    const next = tensions.map((t) =>
      t.id === opts.tensionId
        ? {
            ...t,
            state: opts.outcome,
            ...(answer ? { answer } : {}),
            answered_at: new Date().toISOString(),
          }
        : t,
    );

    const { data: saved, error: saveError } = await rulebookTable()
      .update({
        metadata: { ...baseMeta, coherence: { ...block, tensions: next } },
      } as never)
      // CAS on the version we just read — but we never WRITE a new version.
      .eq("id", opts.rulebookId)
      .eq("version", row.version)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (saveError) throw saveError;
    if (saved) return { status: "saved" };
  }
  return { status: "conflict" };
}
