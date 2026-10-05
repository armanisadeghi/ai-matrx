/**
 * The search projection as the signed-in person — `platform.search_items`, the
 * same index `knowledge_search` and the Knowledge search page read. No
 * organization is passed: it searches every organization the person belongs to
 * plus what is shared with them (access ladder: reads never filter by the
 * active organization). Trashed records are not in the projection.
 */

import { supabase } from "@/utils/supabase/client";
import type { SearchItems } from "./board-records";

export const searchItemsAsPerson: SearchItems = async ({ query, tokens, limit }) => {
  const { data, error } = await supabase
    .schema("platform")
    .rpc("search_items", { p_query: query, p_types: tokens, p_limit: Math.min(limit, 100) });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    entity_token: r.entity_token,
    entity_id: r.entity_id,
    title: r.title,
    subtitle: r.subtitle,
    updated_at: r.updated_at,
  }));
};
