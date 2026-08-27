"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  connectGoogle,
  disconnectGoogle,
  getYouTubeChannelPreview,
  getGoogleAdsCustomers,
  getGoogleAdsReport,
  getGoogleCalendarAgenda,
  getGoogleTasksPreview,
  getTagManagerInventory,
  getYouTubeAnalyticsPreview,
  listGoogleConnectionInventory,
} from "@/features/marketing/google/service";
import type { GoogleConnectionPurpose } from "@/features/marketing/google/service";
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
      connectionPurpose = "general",
    }: {
      code: string;
      owner: GoogleConnectionOwner;
      connectionPurpose?: GoogleConnectionPurpose;
    }) => connectGoogle(code, owner, connectionPurpose),
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

export function useGoogleAdsCustomers() {
  return useMutation({
    mutationFn: ({
      connectionId,
      organizationId,
    }: {
      connectionId: string;
      organizationId?: string | null;
    }) => getGoogleAdsCustomers(connectionId, organizationId),
  });
}

export function useGoogleAdsReport() {
  return useMutation({ mutationFn: getGoogleAdsReport });
}

export function useGoogleCalendarAgenda() {
  return useMutation({ mutationFn: getGoogleCalendarAgenda });
}

export function useGoogleTasksPreview() {
  return useMutation({ mutationFn: getGoogleTasksPreview });
}

export function useYouTubeAnalyticsPreview() {
  return useMutation({ mutationFn: getYouTubeAnalyticsPreview });
}

export function useTagManagerInventory() {
  return useMutation({ mutationFn: getTagManagerInventory });
}
