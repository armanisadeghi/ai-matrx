// features/kg-graph/service/sourceNames.ts
//
// Resolve human-readable names for the source documents behind entity mentions
// (a note's label today; filenames/titles for other kinds as we add them),
// keyed by source id. Reads Supabase directly — per the no-Next-middle-tier
// architecture, and RLS already scopes the caller to their own sources.
//
// This is a stop-gap until the `/kg/.../mentions` API returns `source_label`
// itself (doc 05 §B5); structured so each new source_kind is one more branch.

import { supabase } from "@/utils/supabase/client";

export interface SourceRef {
  kind: string | null;
  id: string | null;
}

export async function fetchSourceNames(
  refs: SourceRef[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();

  const noteIds = Array.from(
    new Set(
      refs.filter((r) => r.kind === "note" && r.id).map((r) => r.id as string),
    ),
  );
  if (noteIds.length > 0) {
    const { data } = await supabase
      .from("notes")
      .select("id,label")
      .in("id", noteIds);
    for (const row of data ?? []) {
      const id = row?.id as string | undefined;
      if (id) {
        const label = ((row?.label as string) || "").trim();
        out.set(id, label || "Untitled note");
      }
    }
  }

  // Future kinds resolve here (cld_file → filename, library_doc → title, …).
  return out;
}
