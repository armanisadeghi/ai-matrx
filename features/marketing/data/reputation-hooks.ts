"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { marketingKeys } from "./hooks";
import {
  getReputationWorkspace,
  updateReputationCase,
} from "./reputation-queries";
import type { Json } from "@/types/database.types";
import type { ReputationCaseStatus } from "./reputation-types";

export const reputationKeys = {
  workspace: (siteId: string, brandId: string) =>
    [...marketingKeys.site(siteId), "reputation", brandId] as const,
};

export function useReputationWorkspace(siteId: string, brandId: string) {
  return useQuery({
    queryKey: reputationKeys.workspace(siteId, brandId),
    queryFn: ({ signal }) => getReputationWorkspace(siteId, brandId, signal),
    enabled: Boolean(siteId && brandId),
  });
}

export function useUpdateReputationCase(siteId: string, brandId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      caseId: string;
      status: ReputationCaseStatus;
      ruling?: Record<string, Json>;
    }) => updateReputationCase(input),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: reputationKeys.workspace(siteId, brandId),
      }),
  });
}
