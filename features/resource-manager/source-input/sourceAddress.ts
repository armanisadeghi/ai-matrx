/**
 * features/resource-manager/source-input/sourceAddress.ts
 *
 * THE address line on a picked Source's card. A web page added by its link
 * carries its address from the door (`draft.origin`); a Source picked any
 * other way — Use existing → Websites, the one search box, a host's own
 * picker — arrives as a bare `processed_document` pointer with no origin, so
 * its card used to say only "Web page". The address is the Source row's
 * `canonical_identity`, so every card that points at a Source with no origin
 * reads it here, once, and takes it (plus its stored kind when the draft has
 * none). One batched read per new set of pointers, under row security.
 *
 * Only a real address is shown: an http(s) link, or a YouTube video's link.
 * Other identities (`pasted-text:<hash>`, a file's content hash) are machine
 * keys and never reach the card.
 */

import { useEffect, useEffectEvent, useRef } from "react";
import type { SourceDraft } from "@ai-matrx/agents/sources/runtime";
import { supabase } from "@/utils/supabase/client";

/** The address a person reads for a Source identity, or null when it is a machine key. */
export function sourceAddress(canonicalIdentity: string | null | undefined): string | null {
  const id = canonicalIdentity?.trim();
  if (!id) return null;
  if (/^https?:\/\/\S+$/i.test(id)) return id;
  const video = /^youtube:([A-Za-z0-9_-]{6,})$/.exec(id);
  if (video) return `https://www.youtube.com/watch?v=${video[1]}`;
  return null;
}

export interface SourceAddressRow {
  id: string;
  source_kind: string | null;
  canonical_identity: string | null;
}

/** What a draft takes from its Source row: the address, and the stored kind when it has none. */
export function sourceDraftPatch(
  draft: Pick<SourceDraft, "origin" | "sourceKind">,
  row: SourceAddressRow,
): Partial<Pick<SourceDraft, "origin" | "sourceKind">> | null {
  const patch: Partial<Pick<SourceDraft, "origin" | "sourceKind">> = {};
  const address = draft.origin ? null : sourceAddress(row.canonical_identity);
  if (address) patch.origin = address;
  if (!draft.sourceKind && row.source_kind) patch.sourceKind = row.source_kind;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** The Source rows behind these ids (row security decides what comes back). */
export async function fetchSourceAddressRows(ids: readonly string[]): Promise<SourceAddressRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase
    .schema("docproc")
    .from("processed_documents")
    .select("id,source_kind,canonical_identity")
    .in("id", [...ids]);
  if (error) throw new Error(`Reading the Sources' addresses failed: ${error.message}`);
  return (data ?? []) as SourceAddressRow[];
}

interface DraftCard {
  id: string;
  draft: Pick<SourceDraft, "origin" | "sourceKind" | "processedDocumentId">;
}

/**
 * Fills the address (and stored kind) of every card that points at a Source and has none.
 * Each Source id is read once per mount; a failed read says so in the console and the card
 * keeps its kind word — the address is extra, never a blocker.
 */
export function useSourceDraftAddresses(
  sources: readonly DraftCard[],
  updateDraft: (id: string, patch: Partial<Pick<SourceDraft, "origin" | "sourceKind">>) => void,
): void {
  const asked = useRef(new Set<string>());
  const wantedKey = [
    ...new Set(
      sources
        .filter((c) => c.draft.processedDocumentId && (!c.draft.origin || !c.draft.sourceKind))
        .map((c) => c.draft.processedDocumentId!),
    ),
  ]
    .sort()
    .join(",");
  const apply = useEffectEvent((rows: SourceAddressRow[]) => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const card of sources) {
      const row = card.draft.processedDocumentId ? byId.get(card.draft.processedDocumentId) : undefined;
      const patch = row ? sourceDraftPatch(card.draft, row) : null;
      if (patch) updateDraft(card.id, patch);
    }
  });
  useEffect(() => {
    const ids = wantedKey ? wantedKey.split(",").filter((id) => !asked.current.has(id)) : [];
    if (ids.length === 0) return;
    for (const id of ids) asked.current.add(id);
    void fetchSourceAddressRows(ids)
      .then(apply)
      .catch((err: unknown) => console.error("[sourceAddress] could not read Source addresses:", err));
  }, [wantedKey]);
}
