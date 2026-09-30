"use client";

import { useMemo } from "react";
import { useActiveContext } from "@/features/scopes/hooks/useActiveContext";
import {
  buildRagSearchContext,
  type RagSearchContextPayload,
} from "@/features/rag/utils/build-rag-search-context";
import type { RagSearchFilters } from "@/features/rag/api/search";

/** Surface-A working scopes → `/knowledge/search` scope fields (never the selected organization). */
export function useRagSearchContext(
  extraFilters?: RagSearchFilters,
): RagSearchContextPayload {
  const { scopeIds } = useActiveContext();

  const filtersKey = JSON.stringify(extraFilters ?? null);

  return useMemo(
    () => buildRagSearchContext({ scopeIds }, extraFilters),
    [scopeIds, filtersKey, extraFilters],
  );
}
