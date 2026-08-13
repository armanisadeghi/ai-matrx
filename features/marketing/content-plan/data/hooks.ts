"use client";

/**
 * features/marketing/content-plan/data/hooks.ts
 *
 * TanStack Query hooks over the content-plan service layer. Convention:
 * EVERY node mutation invalidates the whole site node list — the DB cascade
 * (`_z_node_cascade`) may have recomputed routes/labels anywhere in the
 * subtree, and the client NEVER recomputes derived values itself (that is
 * the invariant, not an optimization opportunity).
 */
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  PlanEntityInsert,
  PlanEntityUpdate,
  PlanNodeInsert,
  PlanNodeUpdate,
  PlanNodeEntityRole,
  PlanReviewPayload,
} from "../types";
import {
  addNodeSecondaryKeyword,
  addNodeTopic,
  attachNodeEntity,
  attachNodeParty,
  detachNodeEntity,
  detachNodeParty,
  linkPartyToSite,
  listPlanNodeEdges,
  listSitePartyIds,
  removeNodeSecondaryKeyword,
  removeNodeTopic,
  unlinkPartyFromSite,
} from "./associations";
import { fetchPartiesByIds } from "@/features/crm/service";
import type { PartyRow } from "@/features/crm/types";
import {
  createPlanEntity,
  createPlanNode,
  listKeywordLabels,
  listNodeArtifacts,
  listNodeSteps,
  listPlanEntities,
  listPlanNodes,
  listPlanProfiles,
  listPlanSiteStats,
  listSeoTopics,
  listSiteKeywordValues,
  reparentPlanNode,
  softDeletePlanEntity,
  softDeletePlanNode,
  updatePlanEntity,
  updatePlanNode,
} from "./service";

export const planKeys = {
  all: ["content-plan"] as const,
  nodes: (siteId: string) => ["content-plan", "nodes", siteId] as const,
  entities: (siteId: string) => ["content-plan", "entities", siteId] as const,
  siteParties: (siteId: string) =>
    ["content-plan", "site-parties", siteId] as const,
  profiles: (orgId: string) => ["content-plan", "profiles", orgId] as const,
  nodeEdges: (nodeId: string) =>
    ["content-plan", "node-edges", nodeId] as const,
  // One joined segment — spreading raw ids would make smaller id-sets
  // invalidation-prefixes of larger ones.
  keywordLabels: (ids: string[]) =>
    ["content-plan", "keyword-labels", ids.join(",")] as const,
  siteKeywordValues: (siteId: string) =>
    ["content-plan", "site-keyword-values", siteId] as const,
  topics: (search: string) => ["content-plan", "topics", search] as const,
  siteStats: () => ["content-plan", "site-stats"] as const,
  nodeSteps: (siteId: string) =>
    ["content-plan", "node-steps", siteId] as const,
  nodeArtifacts: (nodeId: string) =>
    ["content-plan", "node-artifacts", nodeId] as const,
  reality: (siteId: string) => ["content-plan", "reality", siteId] as const,
  cmsPages: (siteId: string) => ["content-plan", "cms-pages", siteId] as const,
};

/** Per-site plan aggregates for the /marketing/content-plan list page. */
export function usePlanSiteStats() {
  return useQuery({
    queryKey: planKeys.siteStats(),
    queryFn: ({ signal }) => listPlanSiteStats(signal),
    staleTime: 30 * 1000,
  });
}

export function usePlanNodes(siteId: string | null) {
  return useQuery({
    queryKey: planKeys.nodes(siteId ?? "none"),
    queryFn: ({ signal }) => listPlanNodes(siteId as string, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

export function usePlanEntities(siteId: string | null) {
  return useQuery({
    queryKey: planKeys.entities(siteId ?? "none"),
    queryFn: ({ signal }) => listPlanEntities(siteId as string, signal),
    enabled: Boolean(siteId),
  });
}

export function usePlanProfiles(orgId: string | null) {
  return useQuery({
    queryKey: planKeys.profiles(orgId ?? "none"),
    queryFn: ({ signal }) => listPlanProfiles(orgId as string, signal),
    enabled: Boolean(orgId),
  });
}

/** Site-wide pipeline step state (plan.node_step) — badges + the NodePanel
 * rail. Server-written; refetched on a modest interval so a running fill
 * visibly advances without a manual refresh. */
export function useNodeSteps(siteId: string | null) {
  return useQuery({
    queryKey: planKeys.nodeSteps(siteId ?? "none"),
    queryFn: ({ signal }) => listNodeSteps(siteId as string, signal),
    enabled: Boolean(siteId),
    refetchInterval: 30 * 1000,
    placeholderData: keepPreviousData,
  });
}

/** One node's pipeline artifacts, every revision (newest first). */
export function useNodeArtifacts(nodeId: string | null) {
  return useQuery({
    queryKey: planKeys.nodeArtifacts(nodeId ?? "none"),
    queryFn: ({ signal }) => listNodeArtifacts(nodeId as string, signal),
    enabled: Boolean(nodeId),
  });
}

export function usePlanNodeEdges(nodeId: string | null) {
  return useQuery({
    queryKey: planKeys.nodeEdges(nodeId ?? "none"),
    queryFn: () => listPlanNodeEdges(nodeId as string),
    enabled: Boolean(nodeId),
  });
}

export function useKeywordLabels(ids: string[]) {
  const sorted = [...ids].sort();
  return useQuery({
    queryKey: planKeys.keywordLabels(sorted),
    queryFn: ({ signal }) => listKeywordLabels(sorted, signal),
    enabled: sorted.length > 0,
    staleTime: 5 * 60 * 1000,
  });
}

export function useSiteKeywordValues(siteId: string | null) {
  return useQuery({
    queryKey: planKeys.siteKeywordValues(siteId ?? "none"),
    queryFn: ({ signal }) => listSiteKeywordValues(siteId as string, undefined, signal),
    enabled: Boolean(siteId),
    staleTime: 60 * 1000,
  });
}

export function useSeoTopics(search: string) {
  return useQuery({
    queryKey: planKeys.topics(search),
    queryFn: ({ signal }) => listSeoTopics(search, signal),
    placeholderData: keepPreviousData,
  });
}

// ─── Node mutations ──────────────────────────────────────────────────────

export function useCreatePlanNode(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlanNodeInsert) => createPlanNode(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
    },
  });
}

export function useUpdatePlanNode(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: PlanNodeUpdate }) =>
      updatePlanNode(args.id, args.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
    },
  });
}

export function useReparentPlanNode(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; parentId: string | null }) =>
      reparentPlanNode(args.id, args.parentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
    },
  });
}

export function useDeletePlanNode(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeletePlanNode(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: planKeys.nodes(siteId) });
    },
  });
}

// ─── Entity mutations ────────────────────────────────────────────────────

export function useCreatePlanEntity(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlanEntityInsert) => createPlanEntity(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: planKeys.entities(siteId),
      });
    },
  });
}

export function useUpdatePlanEntity(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: PlanEntityUpdate }) =>
      updatePlanEntity(args.id, args.patch),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: planKeys.entities(siteId),
      });
    },
  });
}

export function useDeletePlanEntity(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => softDeletePlanEntity(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: planKeys.entities(siteId),
      });
    },
  });
}

// ─── Site people roster (crm.party via party → web_site edges) ───────────

/**
 * The site's people/companies: crm parties linked with a `writes_for` edge.
 * Edge ids resolve through the canonical association chokepoint; rows hydrate
 * through the canonical crm service. A trashed party simply drops out.
 */
export function useSiteParties(siteId: string | null) {
  return useQuery<PartyRow[]>({
    queryKey: planKeys.siteParties(siteId ?? "none"),
    enabled: siteId !== null,
    queryFn: async () => {
      const ids = await listSitePartyIds(siteId as string);
      const rows = await fetchPartiesByIds(ids);
      return rows.sort((a, b) =>
        a.display_name.localeCompare(b.display_name),
      );
    },
  });
}

export function useLinkPartyToSite(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (partyId: string) => linkPartyToSite({ partyId, siteId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: planKeys.siteParties(siteId),
      });
    },
  });
}

export function useUnlinkPartyFromSite(siteId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (partyId: string) => unlinkPartyFromSite({ partyId, siteId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: planKeys.siteParties(siteId),
      });
    },
  });
}

// ─── Association mutations (all invalidate the node's edge list) ─────────

type EdgeAction =
  | { kind: "add-topic"; topicId: string }
  | { kind: "remove-topic"; topicId: string }
  | { kind: "add-secondary-keyword"; keywordId: string }
  | { kind: "remove-secondary-keyword"; keywordId: string }
  | {
      kind: "attach-entity";
      entityId: string;
      role: PlanNodeEntityRole;
      review?: PlanReviewPayload;
    }
  | { kind: "detach-entity"; entityId: string; role: PlanNodeEntityRole }
  | {
      kind: "attach-party";
      partyId: string;
      role: PlanNodeEntityRole;
      review?: PlanReviewPayload;
    }
  | { kind: "detach-party"; partyId: string; role: PlanNodeEntityRole };

export function usePlanNodeEdgeMutation(nodeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: EdgeAction) => {
      switch (action.kind) {
        case "add-topic":
          return addNodeTopic(nodeId, action.topicId);
        case "remove-topic":
          return removeNodeTopic(nodeId, action.topicId);
        case "add-secondary-keyword":
          return addNodeSecondaryKeyword(nodeId, action.keywordId);
        case "remove-secondary-keyword":
          return removeNodeSecondaryKeyword(nodeId, action.keywordId);
        case "attach-entity":
          return attachNodeEntity({
            nodeId,
            entityId: action.entityId,
            role: action.role,
            review: action.review,
          });
        case "detach-entity":
          return detachNodeEntity({
            nodeId,
            entityId: action.entityId,
            role: action.role,
          });
        case "attach-party":
          return attachNodeParty({
            nodeId,
            partyId: action.partyId,
            role: action.role,
            review: action.review,
          });
        case "detach-party":
          return detachNodeParty({
            nodeId,
            partyId: action.partyId,
            role: action.role,
          });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: planKeys.nodeEdges(nodeId),
      });
    },
  });
}
