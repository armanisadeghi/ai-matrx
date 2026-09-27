/**
 * features/sources/sourceActions.ts — what a person can DO to Sources, once,
 * for every surface that lists them (the Knowledge hub; moved here from the
 * retired Sources page, KNOWLEDGE-HUB §8 H6a).
 *
 *   keep      — the keep door (`keepSource`): saving is the signal that starts
 *               processing.
 *   process   — keep, and when the organization's policy still defers
 *               processing, the person's "Process now" override on the
 *               Source's CURRENT version (a person's edit when there is one).
 *   trash     — soft delete, restorable from Trash. A file's own extract goes
 *               with its file (`fn_delete_library_document_and_source`) and
 *               comes back with it.
 *   bulk      — every target is tried; the one sentence counts what happened
 *               and names the first refusal.
 *
 * The hub lists Sources as search hits, which do not carry the row facts these
 * doors need (derivation, organization), so `readActionableSources` reads them
 * directly under RLS first.
 */

import { supabase } from "@/utils/supabase/client";
import { ragDb } from "@/utils/supabase/ragDb";
import { writeOne } from "@/utils/supabase/writeOne";
import { keepSource, sourceRefusalSentence } from "@/features/sources/api/sourcesApi";
import { processSourceNow } from "@/features/sources/api/processNow";
import { isFileCanonicalExtract } from "@/features/sources/sourceRows";

/** The facts about one Source every action door needs. */
export interface ActionableSource {
  id: string;
  name: string;
  source_kind: string;
  derivation_kind: string;
  organization_id: string;
}

/** Read the action facts for these Source ids (RLS decides which come back). */
export async function readActionableSources(ids: string[]): Promise<Map<string, ActionableSource>> {
  const out = new Map<string, ActionableSource>();
  const unique = [...new Set(ids)].filter(Boolean);
  for (let i = 0; i < unique.length; i += 200) {
    const batch = unique.slice(i, i + 200);
    const { data, error } = await supabase
      .schema("docproc")
      .from("processed_documents")
      .select("id, name, source_kind, derivation_kind, organization_id")
      .in("id", batch)
      .is("deleted_at", null);
    if (error) throw new Error(`Your Sources could not be read, so nothing was changed: ${error.message}`);
    for (const r of (data ?? []) as ActionableSource[]) out.set(r.id, r);
  }
  return out;
}

/** Keep (save) one Source. Returns the door's notice, if any. */
export async function keepSourceRow(row: ActionableSource): Promise<string | null> {
  const landed = await keepSource(row.id, { organizationId: row.organization_id });
  return landed.notices?.[0]?.message ?? null;
}

/**
 * Keep one Source and make sure it processes now. `currentDocumentId` is the
 * version people read (from `source_list_facts`); absent, the row itself.
 */
export async function processSourceRow(row: ActionableSource, currentDocumentId?: string | null): Promise<string> {
  const landed = await keepSource(row.id, { organizationId: row.organization_id });
  if (landed.intelligence === "queued") return "Processing has started.";
  const current = currentDocumentId ?? row.id;
  const processed = await processSourceNow(current, {
    isFileExtract: current === row.id && isFileCanonicalExtract(row),
  });
  if (!processed.ok) throw new Error(processed.message);
  return processed.message;
}

/** Move one Source to Trash (restorable). */
export async function trashSource(row: ActionableSource): Promise<null> {
  if (isFileCanonicalExtract(row)) {
    const { error } = await ragDb(supabase).rpc("fn_delete_library_document_and_source", { p_id: row.id });
    if (error)
      throw new Error(`"${row.name}" and its file could not be moved to the trash. You may not be allowed to delete them.`);
    return null;
  }
  await writeOne(
    supabase
      .schema("docproc")
      .from("processed_documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", row.id)
      .is("deleted_at", null)
      .select("id"),
    { action: "delete", noun: "Source" },
  );
  return null;
}

export interface SourceBulkOutcome {
  done: number;
  total: number;
  refusals: string[];
  /** The one sentence the toast shows. */
  sentence: string;
  ok: boolean;
}

/** Run `op` on every target, one at a time; count and say what happened. */
export async function runSourceBulk<T extends { name: string }>(
  label: string,
  targets: T[],
  op: (row: T) => Promise<string | null>,
): Promise<SourceBulkOutcome> {
  const refusals: string[] = [];
  const notes: string[] = [];
  for (const row of targets) {
    try {
      const note = await op(row);
      if (note) notes.push(note);
    } catch (err) {
      refusals.push(sourceRefusalSentence(err));
    }
  }
  const done = targets.length - refusals.length;
  const noun = (n: number) => (n === 1 ? "1 Source" : `${n} Sources`);
  let sentence: string;
  if (!refusals.length) {
    const extra = [...new Set(notes)][0];
    sentence = `${label} ${noun(done)}.${extra ? ` ${extra}` : ""}`;
  } else {
    sentence = `${label} ${done} of ${targets.length}. ${refusals[0]}${refusals.length > 1 ? ` (and ${refusals.length - 1} more)` : ""}`;
  }
  return { done, total: targets.length, refusals, sentence, ok: refusals.length === 0 };
}
