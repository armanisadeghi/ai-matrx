"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAuthReady,
  selectIsAuthenticated,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { selectOrganizationIds } from "@/features/scopes/redux/selectors/tree";
import {
  connectGoogle,
  disconnectGoogle,
  filterGoogleConnectionInventoryForUser,
  getYouTubeChannelPreview,
  getGoogleAdsCustomers,
  getGoogleAdsReport,
  getGoogleCalendarAgenda,
  getGoogleTasksPreview,
  getTagManagerInventory,
  getYouTubeAnalyticsPreview,
  listGoogleConnectionInventory,
  listGoogleCapabilities,
} from "@/features/marketing/google/service";
import type {
  GoogleCapabilityKey,
  GoogleConnectionPurpose,
} from "@/features/marketing/google/service";
import type { GoogleConnectionOwner } from "@/features/marketing/google/types";

export const googleConnectionKeys = {
  inventory: ["marketing", "google-connections"] as const,
  capabilities: ["marketing", "google-capabilities"] as const,
};

export function useGoogleCapabilities() {
  const authReady = useAppSelector(selectAuthReady);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectOrganizationId);
  return useQuery({
    queryKey: [...googleConnectionKeys.capabilities, userId, organizationId],
    queryFn: ({ signal }) => listGoogleCapabilities(signal),
    enabled:
      authReady &&
      isAuthenticated &&
      Boolean(userId) &&
      Boolean(organizationId),
    staleTime: 30_000,
  });
}

export function useGoogleConnectionInventory() {
  const authReady = useAppSelector(selectAuthReady);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const userId = useAppSelector(selectUserId);
  const organizationIds = useAppSelector(selectOrganizationIds);
  const organizationId = useAppSelector(selectOrganizationId);
  return useQuery({
    queryKey: [...googleConnectionKeys.inventory, userId, organizationId],
    queryFn: ({ signal }) => listGoogleConnectionInventory(signal),
    // `users.integration_connections` is deliberately unavailable to `anon`.
    // Core routes can mount before the Redux auth slice hydrates, so do not
    // issue the inventory read until the caller has an authenticated identity.
    enabled: authReady && isAuthenticated && Boolean(userId),
    select: (inventory) =>
      filterGoogleConnectionInventoryForUser(
        inventory,
        userId,
        organizationIds,
      ),
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
      options,
    }: {
      code: string;
      owner: GoogleConnectionOwner;
      connectionPurpose?: GoogleConnectionPurpose;
      options?: {
        targetConnectionId?: string;
        capabilityKey?: GoogleCapabilityKey;
        organizationContextId?: string;
        expectedUserId?: string;
      };
    }) => connectGoogle(code, owner, connectionPurpose, options),
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
