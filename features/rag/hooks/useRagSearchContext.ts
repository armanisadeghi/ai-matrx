"use client";

import { useMemo } from "react";
import { useActiveContext } from "@/features/scopes/hooks/useActiveContext";
import {
  buildRagSearchContext,
  type RagSearchContextPayload,
} from "@/features/rag/utils/build-rag-search-context";
import type { RagSearchFilters } from "@/features/rag/api/search";

/** Surface-A working context → `/rag/search` scope fields. */
export function useRagSearchContext(
  extraFilters?: RagSearchFilters,
): RagSearchContextPayload {
  const { organizationId, scopeIds } = useActiveContext();

  const filtersKey = JSON.stringify(extraFilters ?? null);

  return useMemo(
    () => buildRagSearchContext({ organizationId, scopeIds }, extraFilters),
    [organizationId, scopeIds, filtersKey, extraFilters],
  );
}
