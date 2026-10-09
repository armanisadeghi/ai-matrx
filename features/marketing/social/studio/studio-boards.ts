"use client";

/**
 * The Studio's boards: ordinary saved boards (`projects.boards`) linked to a brand through
 * `settings.brand_id`. A brand's first Studio visit makes one from the Viral breakdown template;
 * the picker lists every other board linked to the brand. No second board store, no new table.
 */

import { supabase } from "@/utils/supabase/client";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { makeBoardFromTemplate } from "@/features/board/templates/board-templates";

const db = projectsDb(supabase);

/** The template a brand's first Studio board starts from (the preset's own `starter`). */
export const STUDIO_STARTER_TEMPLATE = "builtin:viral-breakdown";
export const STUDIO_BRAND_SETTING = "brand_id";

export interface StudioBoard {
  id: string;
  title: string;
  lastOpenedAt: string | null;
}

export async function listStudioBoards(args: { organizationId: string; brandId: string }): Promise<StudioBoard[]> {
  const { data, error } = await db
    .from("boards")
    .select("id, title, last_opened_at, created_at")
    .eq("organization_id", args.organizationId)
    .is("deleted_at", null)
    .contains("settings", { [STUDIO_BRAND_SETTING]: args.brandId })
    .order("last_opened_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not read this brand's Studio boards (${error.message}).`);
  return (data ?? []).map((r) => ({ id: r.id, title: r.title, lastOpenedAt: r.last_opened_at }));
}

const creating = new Map<string, Promise<StudioBoard>>();

/** A new Studio board for the brand, from the starter template. One create per brand at a time. */
export function createStudioBoard(args: { organizationId: string; brandId: string; title: string }): Promise<StudioBoard> {
  const existing = creating.get(args.brandId);
  if (existing) return existing;
  const work = (async () => {
    const board = await makeBoardFromTemplate(STUDIO_STARTER_TEMPLATE, args.organizationId, args.title);
    const { error } = await db
      .from("boards")
      .update({ settings: { [STUDIO_BRAND_SETTING]: args.brandId } })
      .eq("id", board.id);
    if (error) throw new Error(`The board was made but could not be linked to the brand (${error.message}).`);
    return { id: board.id, title: board.title, lastOpenedAt: null };
  })().finally(() => creating.delete(args.brandId));
  creating.set(args.brandId, work);
  return work;
}
