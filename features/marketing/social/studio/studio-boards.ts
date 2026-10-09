"use client";

/**
 * The Studio's boards: ordinary saved boards (`projects.boards`) linked to a brand.
 *
 * - `settings.studio_brand_id` marks THE brand's Studio board. It is unique per (organization, brand)
 *   among live boards in the database (index `boards_one_studio_per_brand`), so a double mount, a reload
 *   or two tabs can never make two: the second insert is refused and re-reads the winner. Never client
 *   timing.
 * - `settings.brand_id` links any other board to the brand (the picker lists them); the Studio board
 *   carries both. A copy (a template use, Duplicate) inherits neither key that makes it the Studio.
 * No second board store, no new table.
 */

import { supabase } from "@/utils/supabase/client";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { makeBoardFromTemplate } from "@/features/board/templates/board-templates";
import { BRAND_BOARD_SETTING, STUDIO_BOARD_SETTING, isBoardError } from "@/features/board/persistence/boardsService";

const db = projectsDb(supabase);

/** The template a brand's first Studio board starts from (the preset's own `starter`). */
export const STUDIO_STARTER_TEMPLATE = "builtin:viral-breakdown";
export const STUDIO_BRAND_SETTING = BRAND_BOARD_SETTING;

export interface StudioBoard {
  id: string;
  title: string;
  lastOpenedAt: string | null;
  /** True for the brand's one Studio board. */
  canonical: boolean;
}

interface Row {
  id: string;
  title: string;
  last_opened_at: string | null;
  settings: unknown;
}

function isCanonical(settings: unknown, brandId: string): boolean {
  return typeof settings === "object" && settings !== null && (settings as Record<string, unknown>)[STUDIO_BOARD_SETTING] === brandId;
}

export function orderStudioBoards(rows: readonly Row[], brandId: string): StudioBoard[] {
  return rows
    .map((r) => ({ id: r.id, title: r.title, lastOpenedAt: r.last_opened_at, canonical: isCanonical(r.settings, brandId) }))
    .sort((a, b) => Number(b.canonical) - Number(a.canonical));
}

/** Every live board linked to the brand, the Studio board first. */
export async function listStudioBoards(args: { organizationId: string; brandId: string }): Promise<StudioBoard[]> {
  const { data, error } = await db
    .from("boards")
    .select("id, title, last_opened_at, created_at, settings")
    .eq("organization_id", args.organizationId)
    .is("deleted_at", null)
    .contains("settings", { [BRAND_BOARD_SETTING]: args.brandId })
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Could not read this brand's Studio boards (${error.message}).`);
  return orderStudioBoards(data ?? [], args.brandId);
}

async function readCanonical(args: { organizationId: string; brandId: string }): Promise<StudioBoard | null> {
  const { data, error } = await db
    .from("boards")
    .select("id, title, last_opened_at, settings")
    .eq("organization_id", args.organizationId)
    .is("deleted_at", null)
    .contains("settings", { [STUDIO_BOARD_SETTING]: args.brandId })
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`Could not read this brand's Studio board (${error.message}).`);
  const row = data?.[0];
  return row ? { id: row.id, title: row.title, lastOpenedAt: row.last_opened_at, canonical: true } : null;
}

const inFlight = new Map<string, Promise<StudioBoard>>();

/**
 * The brand's Studio board: read it, or make it from the starter template with the link stored in the
 * SAME insert. A refused duplicate (the unique link) means someone else just made it: return theirs.
 */
export function getOrCreateStudioBoard(args: { organizationId: string; brandId: string; title: string }): Promise<StudioBoard> {
  const key = `${args.organizationId}|${args.brandId}`;
  const existing = inFlight.get(key);
  if (existing) return existing;
  const work = (async () => {
    const found = await readCanonical(args);
    if (found) return found;
    try {
      const board = await makeBoardFromTemplate(STUDIO_STARTER_TEMPLATE, args.organizationId, args.title, {
        [BRAND_BOARD_SETTING]: args.brandId,
        [STUDIO_BOARD_SETTING]: args.brandId,
      });
      return { id: board.id, title: board.title, lastOpenedAt: null, canonical: true };
    } catch (e) {
      if (isBoardError(e) && e.code === "conflict") {
        const winner = await readCanonical(args);
        if (winner) return winner;
      }
      throw e;
    }
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}

/** An additional board for the brand (not THE Studio): the starter template, linked to the brand. */
export async function createLinkedBoard(args: { organizationId: string; brandId: string; title: string }): Promise<StudioBoard> {
  const board = await makeBoardFromTemplate(STUDIO_STARTER_TEMPLATE, args.organizationId, args.title, {
    [BRAND_BOARD_SETTING]: args.brandId,
  });
  return { id: board.id, title: board.title, lastOpenedAt: null, canonical: false };
}
