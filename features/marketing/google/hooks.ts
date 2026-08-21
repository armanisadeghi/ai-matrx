"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  connectGoogle,
  disconnectGoogle,
  getYouTubeChannelPreview,
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
      code,
      owner,
    }: {
      code: string;
      owner: GoogleConnectionOwner;
    }) => connectGoogle(code, owner),
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

export function useYouTubeChannelPreview() {
  return useMutation({
    mutationFn: ({
      connectionId,
      channelId,
      organizationId,
    }: {
      connectionId: string;
      channelId: string;
      organizationId?: string | null;
    }) => getYouTubeChannelPreview(connectionId, channelId, organizationId),
  });
}
