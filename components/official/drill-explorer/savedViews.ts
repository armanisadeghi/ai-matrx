// components/official/drill-explorer/savedViews.ts — THE SAVED-VIEW SAVE PATH (lane DRILL-EXPLORER).
// A person's Saved view of a drill question: `platform.saved_view` under surface
// `drill/<definition key>`, written through `public.saved_view_save`, the question stored exactly as
// the address carries it.

import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";

import type { ExplorerQuestion } from "./questionParts";

/** The saved-view surface of one definition. */
export function drillSavedViewSurface(definitionKey: string): string {
  return `drill/${definitionKey}`;
}

/**
 * The question as plain JSON (absent keys left out, never `undefined`). What a declared view asks
 * beyond the address (`door`: list and range filters, limits, thresholds, Measures made on the spot)
 * is kept with it, so a saved copy is never wider than the view it copied (VERIFY-DRILL-WAVE1 F3).
 */
export function drillQuestionJson(q: MatrxDrillQuestion | ExplorerQuestion): Json {
  const out: { [key: string]: Json } = {
    by: q.by,
    show: q.show,
    where: q.where.map((w) => ({ dim: w.dim, value: w.value })),
  };
  if (q.across) out.across = q.across;
  if (q.window) out.window = q.window;
  if (q.compare) out.compare = q.compare;
  if (q.share) out.share = true;
  if (q.sort) out.sort = { key: q.sort.key, direction: q.sort.direction };
  if (q.path && q.path.length > 0) out.path = q.path;
  const door = (q as ExplorerQuestion).door;
  if (door && Object.keys(door).length > 0) out.door = JSON.parse(JSON.stringify(door)) as Json;
  return out;
}

/** Keep a question as the person's own Saved view. `ok: false` carries the words to show. */
export async function saveDrillView(args: {
  surfaceKey: string;
  organizationId: string;
  name: string;
  question: MatrxDrillQuestion;
  /**
   * "personal" (the person's own, in the organization they work in) or "internal" — in the admin
   * apps a view lives in the PLATFORM organization and is the platform admins' shared view: the
   * admin seat never keeps views as itself (VERIFIER-32 F7).
   */
  visibility?: "personal" | "internal";
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const name = args.name.trim();
  const { error } = await supabase.rpc("saved_view_save", {
    p_surface_key: args.surfaceKey,
    p_organization_id: args.organizationId,
    p_name: name,
    p_definition: { question: drillQuestionJson(args.question) },
    p_visibility: args.visibility ?? "personal",
    p_touch: true,
  });
  if (error) return { ok: false, message: error.code === "23505" ? `You already have a view called "${name}"` : `The view could not be saved: ${error.message}` };
  return { ok: true };
}

