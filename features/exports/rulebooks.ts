// features/exports/rulebooks.ts
//
// The Rulebooks a person can send export items to, read the way every other
// client read is done in this repo: browser → Supabase → RLS
// (workspace CLAUDE.md § "Clients never route DB reads/writes through the
// Python server"). The SEND itself is a server verb, because the server is
// what writes the consent permit and attaches the Sources.

import { supabase } from "@/utils/supabase/client";
import { operationFailed } from "@/utils/errors";

export interface RulebookChoice {
  id: string;
  name: string;
  description: string;
  status: string;
  updated_at: string | null;
}

export function rulebookHref(rulebookId: string): string {
  return `/masterwork/${rulebookId}`;
}

/** The viewer's Rulebooks, most recently touched first. */
export async function listRulebookChoices(
  limit = 100,
): Promise<RulebookChoice[]> {
  const { data, error } = await supabase
    .schema("platform")
    .from("rulebook")
    .select("id,name,description,status,updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(limit);

  // One plain sentence for the person; the PostgREST detail rides as `cause`
  // for the Error Inspector (utils/errors.ts § the two halves of an audience).
  if (error) throw operationFailed("read your Rulebooks", error);

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: String(row.description ?? ""),
    status: String(row.status ?? ""),
    updated_at: row.updated_at,
  }));
}
