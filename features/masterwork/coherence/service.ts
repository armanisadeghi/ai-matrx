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
// human-authored work (common-docs/systems/platform/provenance/FEATURE.md).

import { supabase } from "@/utils/supabase/client";
import { guardedUpdate } from "@ai-matrx/data/db";
import type { RulebookRow } from "../types";
import { allTensions, SETTLED_STATES } from "./types";

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
  /**
   * Only a state the EXPERT can put a question in. `moot` is the machine's own
   * bookkeeping for a question whose rules were removed — it is written by the
   * server's rule-removing writes, never by a click here.
   */
  outcome: (typeof SETTLED_STATES)[number];
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

    const result = await guardedUpdate<{ id: string; version: number }>({
      expectedVersion: row.version,
      applyUpdate: ({ expectedVersion, nextVersion }) =>
        rulebookTable()
          .update({
            metadata: { ...baseMeta, coherence: { ...block, tensions: next } },
            version: nextVersion,
          } as never)
          .eq("id", opts.rulebookId)
          .eq("version", expectedVersion)
          .is("deleted_at", null)
          .select("id, version")
          .maybeSingle(),
      fetchCurrent: () =>
        rulebookTable()
          .select("id, version")
          .eq("id", opts.rulebookId)
          .is("deleted_at", null)
          .maybeSingle(),
    });
    if (result.status === "saved") return { status: "saved" };
    if (result.status === "not_found") return { status: "not_found" };
  }
  return { status: "conflict" };
}
