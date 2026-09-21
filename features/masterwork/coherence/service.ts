// features/masterwork/coherence/service.ts
//
// Recording how the Expert settled one Coherence question.
//
// 🚨 This writes `metadata.coherence` ONLY and deliberately does NOT bump
// `version` — `version` is the RULES version a Masterwork drifts against, and a
// question ABOUT the rules is not a change to them. Same discipline as the
// server's `_save_tensions` and as `metadata.expert_corpus` / `metadata.elicitation`.
//
// 🚨 It changes no rule's WORDS. If the Expert's answer means a rule should say
// something different, that is a separate edit that lands as a draft they approve —
// AI never overwrites human-authored work
// (common-docs/systems/platform/provenance/FEATURE.md).
//
// 🚨 But a ruling is no longer INVISIBLE on the rules it was about (2026-09-12,
// Arman's expertise mandate). "Both are right" keeps both rules and links them
// `disagrees_with` with the condition the Expert named, and every ruling stamps
// who settled it — see `settlement.ts`. That write rides the SAME compare-and-swap
// as the answer, so the Rulebook can never hold a settled question whose rules
// never got the structure.

import { supabase } from "@/utils/supabase/client";
import { getClaimsUser } from "@/utils/supabase/claimsUser";
import { operationFailed } from "@/utils/errors";
import { guardedUpdate } from "@ai-matrx/data/db";
import { doorCas } from "@/lib/db/door-cas";
import type { RulebookRow, RulebookRule } from "../types";
import { applySettlement } from "./settlement";
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
  // Who is ruling. Stamped on the rules so a reader of either one alone can see
  // a human decided this — never a guess, and never blocking the save if the
  // session read fails.
  const settledBy = (await getClaimsUser(supabase)).data.user?.id;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await rulebookTable()
      .select("id, version, metadata, rules")
      .eq("id", opts.rulebookId)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) throw operationFailed("record your answer", error);
    if (!data) return { status: "not_found" };

    const row = data as Pick<RulebookRow, "id" | "version" | "metadata" | "rules">;
    const tensions = allTensions({ metadata: row.metadata });
    const match = tensions.find((t) => t.id === opts.tensionId);
    if (!match) return { status: "not_found" };

    const answer = opts.answer?.trim();
    const settledAt = new Date().toISOString();
    // What the ruling leaves ON THE RULES. `null` means this outcome writes
    // nothing there (`dismissed`), and the rules column is then left untouched.
    const nextRules = applySettlement(
      (row.rules ?? []) as RulebookRule[],
      match.rule_ids,
      opts.outcome,
      { condition: answer, settledBy, at: settledAt },
    );

    const result = await guardedUpdate<{ id: string; version: number }>({
      expectedVersion: row.version,
      // 🚨 THE SURGICAL DOOR, and it is why this is the one metadata write in the
      // Masterwork that did NOT become a generic patch. This code used to rebuild
      // the whole `coherence` block from the row it had read
      // (`{ ...block, tensions: next }`) — so any key the Coherence Partner wrote
      // between that read and this write was lost, and the CAS could not see it,
      // because `platform._touch_rulebook` deliberately does not bump `version`
      // for a coherence-only write (that is what stops the Partner ageing out the
      // save an Expert is in the middle of). `rulebook_tension_settle` rewrites
      // ONE tension, matched by id, against the block AS IT STANDS AT WRITE TIME.
      // It also cannot produce `moot`, which is the machine's own state for a
      // question whose rules were removed — this door is the Expert's only.
      applyUpdate: ({ expectedVersion }) =>
        doorCas<{ id: string; version: number }>(
          supabase.rpc("rulebook_tension_settle", {
            p_rulebook_id: opts.rulebookId,
            p_expected_version: expectedVersion,
            p_tension_id: opts.tensionId,
            p_outcome: opts.outcome,
            ...(answer ? { p_answer: answer } : {}),
            ...(nextRules ? { p_rules: nextRules as never } : {}),
          }),
        ),
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
