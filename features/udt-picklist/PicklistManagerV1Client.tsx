"use client";

import { Loader2 } from "lucide-react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { PicklistManagerV1 } from "./PicklistManagerV1";

interface PicklistManagerV1ClientProps {
  forcedListId?: string | null;
}

/**
 * Thin client wrapper that injects the browser Supabase client and the
 * Redux-backed user id into PicklistManagerV1. Use this from any route,
 * window panel, or modal that doesn't already have those values in scope.
 */
export function PicklistManagerV1Client({
  forcedListId,
}: PicklistManagerV1ClientProps) {
  const userId = useAppSelector(selectUserId);

  if (!userId) {
    return (
      <div className="flex h-full min-h-[400px] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Signing you in…
      </div>
    );
  }

  return (
    <PicklistManagerV1
      supabase={supabase}
      userId={userId}
      forcedListId={forcedListId ?? undefined}
    />
  );
}
