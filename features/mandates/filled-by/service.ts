// features/mandates/filled-by/service.ts
//
// "Which mandates does this agent (or workflow) fill, for me?" — for ONE list
// page, in ONE call to `public.mnd_filled_by`
// (migrations/mnd_filled_by_holders.sql). The answer is the holder the mandate
// side shows for each mandate: the winning rung for the viewer's seat — the
// system default, the viewer's ACTIVE organization's choice, the viewer's own.
//
// Direct browser → Supabase: a plain read the person is entitled to make.

import { supabase } from "@/utils/supabase/client";
import { getStoreSingleton } from "@/lib/redux/store-singleton";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

export type MandateHolderKind = "agent" | "workflow";

/** One mandate a holder currently fills. */
export interface FilledMandate {
  mandateId: string;
  mandateKey: string;
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
): Promise<WithFilledMandates<TRow>[]> {
  if (rows.length === 0) return [];
  const ids = rows.map(idOf);
  const state = getStoreSingleton()?.getState();
  const resolveOrgId = state ? selectOrganizationId(state) : null;

  const { data, error } = await supabase.rpc("mnd_filled_by", {
    p_holder_type: holderType,
    p_holder_ids: ids,
    p_resolve_org_id: resolveOrgId ?? undefined,
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
      mandateKey: r.mandate_key,
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
