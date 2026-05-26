"use client";

import { Loader2 } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { PicklistManager } from "./picklist-manager-v3";

/**
 * Thin client wrapper that injects the browser Supabase client and the
 * Redux-backed user id into the Notion-style `PicklistManager` (v3). Use this
 * from any route, window panel, or modal that doesn't already have those
 * values in scope. Mirrors `PicklistManagerV1Client`.
 */
export function PicklistManagerV3Client() {
  const userId = useAppSelector(selectUserId);

  if (!userId) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Signing you in…
      </div>
    );
  }

  return <PicklistManager supabase={supabase} userId={userId} />;
}
