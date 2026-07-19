"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  connectGoogle,
  disconnectGoogle,
  listGoogleConnectionInventory,
} from "@/features/marketing/google/service";
import type { GoogleConnectionOwner } from "@/features/marketing/google/types";

export const googleConnectionKeys = {
  inventory: ["marketing", "google-connections"] as const,
};

export function useGoogleConnectionInventory() {
  return useQuery({
    queryKey: googleConnectionKeys.inventory,
    queryFn: ({ signal }) => listGoogleConnectionInventory(signal),
    staleTime: 30_000,
  });
}

export function useConnectGoogle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      owner,
      returnPath,
    }: {
      owner: GoogleConnectionOwner;
      returnPath: string;
    }) => connectGoogle(owner, returnPath),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: googleConnectionKeys.inventory,
      }),
  });
}

export function useDisconnectGoogle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: disconnectGoogle,
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: googleConnectionKeys.inventory,
      }),
  });
}
