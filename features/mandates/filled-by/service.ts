// features/mandates/filled-by/service.ts
//
// "Which mandates does this agent (or workflow) fill, for me?" — for ONE list
// page, in ONE call to `public.mnd_filled_by`
// (migrations/mnd_filled_by_holders.sql). The answer is the holder the mandate
// side shows for each mandate: the winning rung for the viewer's seat — the
// system default, the chosen organization's choice (the page's organization filter — never the
// active organization), the viewer's own.
//
// Direct browser → Supabase: a plain read the person is entitled to make.

import { supabase } from "@/utils/supabase/client";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { storedMandateKey, type AnyMandateKey } from "@/features/mandates/mandate-key";

export type MandateHolderKind = "agent" | "workflow";

/** One mandate a holder currently fills. */
export interface FilledMandate {
  mandateId: string;
  mandateKey: AnyMandateKey;
  /** The mandate's own label; null when it has none (display derives one). */
  label: string | null;
}

/**
 * What a list row carries: the mandates it fills, or `null` when the read
 * failed — the cell says so instead of printing a zero nobody measured.
 */
export type FilledMandates = FilledMandate[] | null;

/** Rows with the `fills_mandates` field every list shell cell reads. */
export type WithFilledMandates<TRow> = TRow & { fills_mandates?: FilledMandates };

/**
 * Attach `fills_mandates` to every row of a page. One RPC for the page; a
 * failed read marks the rows unmeasured (null) and reports it, never breaks
 * the list.
 */
export async function attachFilledMandates<TRow>(
  holderType: MandateHolderKind,
  rows: TRow[],
  idOf: (row: TRow) => string,
  /**
   * The page's organization filter (`query.orgId`), when one is set. This is a
   * DISPLAY read: it resolves in the filtered organization or, with All
   * organizations, in none — never in the ACTIVE organization, which only
   * decides where new things are saved (active-org law).
   */
  orgFilterId: string | null = null,
): Promise<WithFilledMandates<TRow>[]> {
  if (rows.length === 0) return [];
  const ids = rows.map(idOf);

  const { data, error } = await supabase.rpc("mnd_filled_by", {
    p_holder_type: holderType,
    p_holder_ids: ids,
    p_resolve_org_id: orgFilterId ?? undefined,
  });

  if (error) {
    captureError({
      source: "supabase-postgrest",
      operation: "rpc",
      relation: "mnd_filled_by",
      code: error.code || "mnd_filled_by_failed",
      message: `mnd_filled_by (${holderType}, ${ids.length} ids): ${error.message}`,
      userMessage:
        "The Fills mandates column could not be read for this page; reload to try again.",
    });
    return rows.map((row) => ({ ...row, fills_mandates: null }));
  }

  const byHolder = new Map<string, FilledMandate[]>();
  for (const r of data ?? []) {
    const list = byHolder.get(r.holder_id) ?? [];
    list.push({
      mandateId: r.mandate_id,
      mandateKey: storedMandateKey(r.mandate_key),
      // The RPC falls back to the key when there is no label; the display
      // helper derives a readable name from the key itself.
      label: r.label && r.label !== r.mandate_key ? r.label : null,
    });
    byHolder.set(r.holder_id, list);
  }
  return rows.map((row) => ({
    ...row,
    fills_mandates: byHolder.get(idOf(row)) ?? [],
  }));
}
