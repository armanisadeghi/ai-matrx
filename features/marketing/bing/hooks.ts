"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  bindBingSite,
  connectBingApiKey,
  disconnectBing,
  listBingConnectionInventory,
} from "@/features/marketing/bing/service";
import type { BingConnectionOwner } from "@/features/marketing/bing/types";
import { marketingKeys } from "@/features/marketing/data/hooks";

export const bingConnectionKeys = {
  inventory: ["marketing", "bing-connections"] as const,
};

export function useBingConnectionInventory() {
  return useQuery({
    queryKey: bingConnectionKeys.inventory,
    queryFn: ({ signal }) => listBingConnectionInventory(signal),
    staleTime: 30_000,
  });
}

export function useConnectBingApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      apiKey,
      owner,
    }: {
      apiKey: string;
      owner: BingConnectionOwner;
    }) => connectBingApiKey(apiKey, owner),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: bingConnectionKeys.inventory }),
  });
}

export function useBindBingSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: bindBingSite,
    onSuccess: (_result, variables) => {
      void queryClient.invalidateQueries({
        queryKey: marketingKeys.site(variables.siteId),
      });
      void queryClient.invalidateQueries({ queryKey: marketingKeys.root });
    },
  });
}

export function useDisconnectBing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      connectionId,
      organizationId,
    }: {
      connectionId: string;
      organizationId?: string | null;
    }) => disconnectBing(connectionId, organizationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bingConnectionKeys.inventory });
      void queryClient.invalidateQueries({ queryKey: marketingKeys.root });
    },
  });
}
