"use client";

// features/spaces/page/content-edit.ts — whether this person holds "Can edit content" (edit_content) on a page.
// get_resource_access answers view / edit / admin only, so a viewer-level answer asks the access kernel once more.

import { useEffect, useState } from "react";

import { supabase } from "@/utils/supabase/client";

/** True when this person holds "Can edit content" (edit_content) on the page but not editor — asked only for a viewer. */
export function useContentEditOnly(spaceId: string, ask: boolean): boolean {
  const [yes, setYes] = useState(false);
  useEffect(() => {
    if (!ask) return setYes(false);
    let live = true;
    const iam = supabase.schema("iam" as never) as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
    };
    void iam.rpc("has_access", { p_type: "document", p_id: spaceId, p_required: "edit_content" }).then(({ data, error }) => {
      if (live) setYes(!error && data === true);
    });
    return () => {
      live = false;
    };
  }, [spaceId, ask]);
  return yes;
}
