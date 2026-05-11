"use client";

// Direct-Supabase queries for the user's saved WC claims.
//
// This file replaces the old `bookmarks.ts`. The bookmarks table has been
// dropped — `wc_claim` now carries `user_id` directly, and RLS policies on
// the table restrict reads/writes to the owner (plus org/project members,
// per the standard scope pattern). So the FE can query `wc_claim` directly
// the same way it queries `notes`, `ctx_tasks`, etc.
//
// Per the project's data-access principles:
//   - Direct DB reads (no business logic) → Supabase, not Python.
//   - The Supabase client is a singleton; one URL for everyone, RLS is
//     enforced server-side.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/utils/supabase/client";

export interface SavedClaimRow {
  id: string;
  applicant_name: string | null;
  case_number: string | null;
  date_of_injury: string | null;
  occupational_code: number | null;
  user_id: string | null;
  organization_id: string | null;
  project_id: string | null;
  is_public: boolean;
  tags: string[];
  created_at: string;
  updated_at: string | null;
}

const TABLE = "wc_claim";

const claimsKeys = {
  // Per-user scoping in the query key so toggling between accounts (or
  // signing out/in) doesn't surface stale rows from the previous session.
  list: (userId: string | undefined) => ["wc-claims", "list", userId] as const,
};

export { claimsKeys };

/** List the current user's saved WC claims (RLS already filters server-side). */
export function useMyClaims(userId: string | undefined) {
  return useQuery<SavedClaimRow[]>({
    queryKey: claimsKeys.list(userId),
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(TABLE as never)
        .select(
          "id, applicant_name, case_number, date_of_injury, occupational_code, " +
            "user_id, organization_id, project_id, is_public, tags, created_at, updated_at",
        )
        .order("updated_at", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as SavedClaimRow[];
    },
  });
}

/** Delete a saved WC claim (RLS gates: only the owner can DELETE). */
export function useDeleteClaim() {
  const qc = useQueryClient();
  return useMutation<void, Error, { userId: string; claimId: string }>({
    mutationFn: async ({ claimId }) => {
      const { error } = await supabase
        .from(TABLE as never)
        .delete()
        .eq("id", claimId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_, { userId }) => {
      qc.invalidateQueries({ queryKey: claimsKeys.list(userId) });
    },
  });
}
