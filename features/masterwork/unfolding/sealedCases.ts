/**
 * THE SEALED-CASE LANE, client half — how the run box knows a Masterwork is a
 * DESK (it unfolds a sealed case) and which cases it may be pointed at.
 *
 * Contract: `common-docs/systems/masterwork/unfolding-case-contract.md` §3/§5.
 *
 * ## THE WITHHOLDING LAW reaches the browser too
 *
 * A held-out corpus row is SEALED: its timeline and its resolution are read by
 * exactly two callers server-side (the case oracle and the unfolding judge),
 * and by NOBODY in the browser. So this reader selects `id, label,
 * source_meta, created_at` — never `raw_value`, never `metadata` — because a
 * picker that ships the answer to the tab has already spoiled the exam, and a
 * column you never select cannot leak.
 *
 * ## Why `readAllRows`
 *
 * The picker is a list the Expert treats as COMPLETE ("these are my sealed
 * cases"): a PostgREST 1000-row cap would silently hide cases they hold. A
 * short list is not an acceptable answer here.
 */

import { readAllRows } from "@ai-matrx/data/db";

import { supabase } from "@/utils/supabase/client";
import type { WorkflowDefinitionLike } from "@/features/workflow-runtime/trigger-points";

/** The case-oracle graph node's spec type (aidream `case_oracle.py`). */
export const CASE_DISCLOSE_NODE_TYPE = "masterwork.case.disclose";

/** The run input the desk is started with — the sealed row it must unfold. */
export const CASE_ITEM_INPUT_NAME = "case_item_id";

/** The corpus row kind and role that make a row a SEALED case. */
export const TIMELINE_ITEM_KIND = "timeline";
export const HELDOUT_ROLE = "heldout";

/**
 * Is this Masterwork a DESK? Returns the disclose node's id (the run box reads
 * that node's outputs to draw the ledger), or null when the definition carries
 * no case oracle — in which case the picker must not appear at all.
 *
 * Pure, and it reads BOTH shapes on purpose: a programmatic definition carries
 * `type` on the node, and a builder-authored one carries `data.spec_type`.
 * Reading one of the two is how a desk built through the other door silently
 * loses its picker.
 */
export function findCaseDiscloseNodeId(
  definition: WorkflowDefinitionLike | null,
): string | null {
  if (!definition || !Array.isArray(definition.nodes)) return null;
  for (const node of definition.nodes) {
    const specType = node.data?.spec_type;
    if (
      node.type === CASE_DISCLOSE_NODE_TYPE ||
      specType === CASE_DISCLOSE_NODE_TYPE
    ) {
      return node.id;
    }
  }
  return null;
}

/** One sealed case, as the picker is allowed to know it. */
export interface SealedCase {
  id: string;
  /** The case title the Expert gave it. Never the narrative. */
  label: string;
  /** `source_meta.published` — the publication date, when the source had one. */
  published: string | null;
}

interface SealedCaseRow {
  id: string;
  label: string | null;
  source_meta: unknown;
  created_at: string;
}

function publishedOf(sourceMeta: unknown): string | null {
  if (typeof sourceMeta !== "object" || sourceMeta === null) return null;
  const value = (sourceMeta as Record<string, unknown>).published;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * The Rulebook a Masterwork was built from (`metadata.built_from_rulebook`) —
 * the owner of its corpus. Read here rather than threaded through five call
 * sites: the definition already knows, so asking every host to repeat it would
 * be five places for the answer to drift.
 */
export async function rulebookIdForMasterwork(
  masterworkId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .schema("workflow")
    .from("definition")
    .select("metadata")
    .eq("id", masterworkId)
    .maybeSingle();
  if (error || !data) return null;
  const meta = (data.metadata ?? {}) as Record<string, unknown>;
  const rulebookId = meta.built_from_rulebook;
  return typeof rulebookId === "string" && rulebookId ? rulebookId : null;
}

/**
 * Every sealed (held-out) timeline case this Rulebook holds, newest first.
 * Label + published date only — see the module header.
 */
export async function listSealedCases(
  rulebookId: string,
): Promise<SealedCase[]> {
  const rows = await readAllRows<SealedCaseRow>(({ from, to }) =>
    supabase
      .schema("platform")
      .from("masterwork_corpus_item")
      .select("id,label,source_meta,created_at", { count: "exact" })
      .eq("rulebook_id", rulebookId)
      .eq("kind", TIMELINE_ITEM_KIND)
      .eq("metadata->>role", HELDOUT_ROLE)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to),
    { label: "platform.masterwork_corpus_item (sealed cases)" },
  );
  return rows.map((row) => ({
    id: row.id,
    label: row.label?.trim() || "An untitled sealed case",
    published: publishedOf(row.source_meta),
  }));
}
