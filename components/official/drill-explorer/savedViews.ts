// components/official/drill-explorer/savedViews.ts — THE SAVED-VIEW SAVE PATH (lane DRILL-EXPLORER).
// A person's Saved view of a drill question: `platform.saved_view` under surface
// `drill/<definition key>`, written through `public.saved_view_save`, the question stored exactly as
// the address carries it.

import type { MatrxDrillQuestion } from "@ai-matrx/design-system/data-table";

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";

/** The saved-view surface of one definition. */
export function drillSavedViewSurface(definitionKey: string): string {
  return `drill/${definitionKey}`;
}

/** The question as plain JSON (absent keys left out, never `undefined`). */
export function drillQuestionJson(q: MatrxDrillQuestion): Json {
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
  return out;
}

/** Keep a question as the person's own Saved view. `ok: false` carries the words to show. */
export async function saveDrillView(args: {
  surfaceKey: string;
  organizationId: string;
  name: string;
  question: MatrxDrillQuestion;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const name = args.name.trim();
  const { error } = await supabase.rpc("saved_view_save", {
    p_surface_key: args.surfaceKey,
    p_organization_id: args.organizationId,
    p_name: name,
    p_definition: { question: drillQuestionJson(args.question) },
    p_visibility: "personal",
    p_touch: true,
  });
  if (error) return { ok: false, message: error.code === "23505" ? `You already have a view called "${name}"` : `The view could not be saved: ${error.message}` };
  return { ok: true };
}

