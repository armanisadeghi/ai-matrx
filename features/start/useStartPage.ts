"use client";

// features/start/useStartPage.ts — read and set this person's start page (the newest choice wins).
// Must sit under a records provider; writes go to that provider's organization.
import { useTypedTable } from "@ai-matrx/records/react";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { startPageChoice } from "./startPage.typed-table";

export function useStartPage() {
  const userId = useAppSelector(selectUserId);
  const table = useTypedTable(startPageChoice);
  const mine = table.rows
    .filter((r) => r.person === userId)
    .sort((a, b) => (b.chosen_at ?? "").localeCompare(a.chosen_at ?? ""));
  return {
    pageId: mine[0]?.page_id ?? null,
    loading: table.loading,
    error: table.error,
    choose: (pageId: string) =>
      userId
        ? table.upsert({ person: userId, page_id: pageId, chosen_at: new Date().toISOString() })
        : Promise.resolve({ ok: false as const, error: { code: "invalid_argument" as const, message: "Sign in to choose a start page." } }),
  };
}
