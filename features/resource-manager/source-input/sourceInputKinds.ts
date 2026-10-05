/**
 * WHICH kinds "Use existing" offers, and in WHAT order — the registry decides, never a list here.
 *
 * `platform.entity_types.source_input_pickable` says a kind is offered; `source_input_order` says
 * where it sits (ascending, nulls last). Kinds sharing an order number are ONE entry: Documents is
 * the markdown `document` plus the cloud `udt_document`. Adding a kind later is one registry
 * setting — a token with no presentation below still shows, under its registry label.
 *
 * What this file holds is only PRESENTATION and HOW A KIND IS LISTED, per token:
 *   - the name Arman approved for the entry (2026-10-05, "list yes"): Files · Notes · Documents ·
 *     Websites · Transcripts · Conversations · Tables · Workbooks · Saved results;
 *   - `processed_document` is listed from the person's saved web pages (Websites);
 *   - `dataset` is listed from the record store: Tables AND pick lists (a Pick list is a Table;
 *     its rows carry a "Pick list" badge), every one picked as the ONE token `dataset` — the
 *     server reads the table and decides whether it is rows or a pick list's choices.
 */

import type { ComponentType } from "react";
import {
  AudioLines,
  FileText,
  Files,
  Globe,
  Layers,
  Library,
  MessagesSquare,
  NotebookText,
  Sheet,
  Table,
} from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import type { SavedSourceGroup } from "@/features/resource-manager/source-input/savedWebPages";

/** One registry row the Source input offers. */
export interface SourceInputKindRow {
  token: string;
  label: string;
  order: number | null;
}

interface Presentation {
  plural: string;
  Icon: ComponentType<{ className?: string }>;
  savedSourceGroup?: SavedSourceGroup;
  /** Listed from the record store (tables + pick lists). */
  recordStore?: true;
}

/** Per registry token; an entry takes the first of its tokens that has one. */
const PRESENTATION: Record<string, Presentation> = {
  file: { plural: "Files", Icon: Files },
  note: { plural: "Notes", Icon: NotebookText },
  document: { plural: "Documents", Icon: FileText },
  udt_document: { plural: "Documents", Icon: FileText },
  processed_document: { plural: "Websites", Icon: Globe, savedSourceGroup: "web_page" },
  transcript: { plural: "Transcripts", Icon: AudioLines },
  conversation: { plural: "Conversations", Icon: MessagesSquare },
  dataset: { plural: "Tables", Icon: Table, recordStore: true },
  workbook: { plural: "Workbooks", Icon: Sheet },
  content_ir_kind_instance: { plural: "Saved results", Icon: Layers },
};

/** One entry of the Use existing list. */
export interface SourceInputEntry {
  /** Stable key: the entry's tokens joined. */
  key: string;
  /** Every registry token this entry lists (Documents = two). */
  tokens: string[];
  plural: string;
  Icon: ComponentType<{ className?: string }>;
  savedSourceGroup?: SavedSourceGroup;
  recordStore?: boolean;
}

/** Group registry rows into entries, in registry order. Pure — the tests drive it with rows. */
export function sourceInputEntries(rows: readonly SourceInputKindRow[]): SourceInputEntry[] {
  const sorted = [...rows].sort((a, b) => {
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    return ao - bo || a.token.localeCompare(b.token);
  });
  const groups: SourceInputKindRow[][] = [];
  for (const row of sorted) {
    const last = groups[groups.length - 1];
    if (last && row.order !== null && last[0]!.order === row.order) last.push(row);
    else groups.push([row]);
  }
  return groups.map((group) => {
    const first = group[0]!;
    const shown = group.map((r) => PRESENTATION[r.token]).find(Boolean);
    return {
      key: group.map((r) => r.token).join("+"),
      tokens: group.map((r) => r.token),
      plural: shown?.plural ?? first.label,
      Icon: shown?.Icon ?? Library,
      savedSourceGroup: shown?.savedSourceGroup,
      recordStore: shown?.recordStore,
    };
  });
}

let cached: Promise<SourceInputKindRow[]> | null = null;

/** The offered kinds, read once per page load from the registry. A failed read is not cached. */
export function fetchSourceInputKinds(): Promise<SourceInputKindRow[]> {
  if (cached) return cached;
  const read = (async () => {
    // `platform.entity_types` is not client-readable; this door returns only these three columns.
    const { data, error } = await supabase.rpc("source_input_kinds");
    if (error) throw new Error(`Reading which kinds can be used failed: ${error.message}`);
    return (data ?? []).map((r) => ({
      token: r.token,
      label: r.label ?? r.token,
      order: r.source_input_order ?? null,
    }));
  })();
  cached = read;
  read.catch(() => {
    if (cached === read) cached = null;
  });
  return read;
}
