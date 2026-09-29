/**
 * The column write for one change to a record's row controls ("Shown to", "Published to the web",
 * "Indexed by search engines") — the one translation from the RowAccessControl patch to the table's
 * columns, so every feature writer that backs the control sends the same shape
 * (common-docs/policies/access-ladder.md, Words table).
 *
 * "Indexed by search engines" is not written here: a table that carries `search_engine_indexed`
 * writes it in its own writer.
 */
import { publishedToWebPatch, type ShownTo } from "@/lib/row-access";
import { supabase } from "@/utils/supabase/client";

export interface RowAccessChange {
  shownTo?: ShownTo | null;
  publishedToWeb?: boolean;
}

export interface RowAccessColumns {
  shown_to?: ShownTo | null;
  published_to_web?: boolean;
  published_to_web_at?: string | null;
  published_to_web_by?: string | null;
}

export function rowAccessColumns(
  change: RowAccessChange,
  userId: string | null,
): RowAccessColumns {
  const cols: RowAccessColumns = {};
  if (change.shownTo !== undefined) cols.shown_to = change.shownTo;
  if (change.publishedToWeb !== undefined)
    Object.assign(cols, publishedToWebPatch(change.publishedToWeb, userId));
  return cols;
}

/** The signed-in person's id for the `published_to_web_by` stamp (the database stamps it too). */
export async function currentUserIdOrNull(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
