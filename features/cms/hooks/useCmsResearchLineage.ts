"use client";

import { useState } from "react";

import type {
  ContainerResourceRow,
  ContainerResourcesAdapter,
} from "@/features/scopes/components/associations/AssociationList";
import {
  useContainerLinks,
  type ContainerLink,
} from "@/features/scopes/hooks/useContainerLinks";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

export const RESEARCH_LINEAGE_TOKENS = [
  "research_topic",
  "research_tag",
] as const satisfies readonly EntityTypeToken[];

type ResearchLineageToken = (typeof RESEARCH_LINEAGE_TOKENS)[number];
type AnchorToken = "web_site" | "plan_node" | "web_page";

export interface ResearchLineageEntry {
  token: ResearchLineageToken;
  id: string;
  title: string;
  origins: { token: AnchorToken | "cms_site" | "cms_page"; id: string }[];
}

export interface UseCmsResearchLineageArgs {
  scope: "site" | "page";
  cmsEntityId: string;
  organizationId?: string | null;
  webSiteId?: string | null;
  planNodeId?: string | null;
  webPageId?: string | null;
  researchTopicIds: readonly string[];
  researchTagIds: readonly string[];
  persistScratch: (topicIds: string[], tagIds: string[]) => Promise<void>;
}

export interface CmsResearchLineageState {
  adapter: ContainerResourcesAdapter;
  entries: ResearchLineageEntry[];
  canPromoteScratch: boolean;
  promoteScratch: () => Promise<{ ok: boolean; error?: string }>;
}

interface Occurrence {
  token: ResearchLineageToken;
  id: string;
  label: string | null;
  originToken: AnchorToken | "cms_site" | "cms_page";
  originId: string;
  direct: boolean;
  scratch: boolean;
  role: string | null;
}

function inheritedPlanNodeId(link: ContainerLink): string | null {
  if (
    link.role !== "inherited_from_plan" ||
    typeof link.metadata !== "object" ||
    link.metadata === null ||
    Array.isArray(link.metadata)
  ) {
    return null;
  }
  const value = link.metadata.plan_node_id;
  return typeof value === "string" ? value : null;
}

function statusFor(
  statuses: ContainerResourcesAdapter["status"][],
): ContainerResourcesAdapter["status"] {
  if (statuses.includes("error")) return "error";
  if (statuses.includes("loading") || statuses.includes("idle"))
    return "loading";
  return "ready";
}

/**
 * Merge canonical site/plan/page associations with the CMS-only draft bridge.
 * Writes choose the most specific canonical anchor available; a totally
 * scratch CMS row writes its guarded UUID arrays instead.
 */
export function useCmsResearchLineage(
  args: UseCmsResearchLineageArgs,
): CmsResearchLineageState {
  const scratchSourceKey = `${args.researchTopicIds.join(",")}|${args.researchTagIds.join(",")}`;
  const [scratchOverride, setScratchOverride] = useState<{
    sourceKey: string;
    topicIds: string[];
    tagIds: string[];
  } | null>(null);
  const scratchTopicIds =
    scratchOverride?.sourceKey === scratchSourceKey
      ? scratchOverride.topicIds
      : [...args.researchTopicIds];
  const scratchTagIds =
    scratchOverride?.sourceKey === scratchSourceKey
      ? scratchOverride.tagIds
      : [...args.researchTagIds];

  const siteLinks = useContainerLinks({
    containerType: "web_site",
    containerId: args.webSiteId ?? null,
    orgId: args.organizationId,
  });
  const nodeLinks = useContainerLinks({
    containerType: "plan_node",
    containerId: args.planNodeId ?? null,
    orgId: args.organizationId,
  });
  const pageLinks = useContainerLinks({
    containerType: "web_page",
    containerId: args.webPageId ?? null,
    orgId: args.organizationId,
  });

  const preferred =
    args.scope === "site"
      ? args.webSiteId
        ? { token: "web_site" as const, id: args.webSiteId, links: siteLinks }
        : null
      : args.webPageId
        ? { token: "web_page" as const, id: args.webPageId, links: pageLinks }
        : args.planNodeId
          ? {
              token: "plan_node" as const,
              id: args.planNodeId,
              links: nodeLinks,
            }
          : null;

  const occurrences: Occurrence[] = [];
  const addLinks = (
    originToken: AnchorToken,
    originId: string | null | undefined,
    links: ReturnType<typeof useContainerLinks>,
  ) => {
    if (!originId) return;
    for (const token of RESEARCH_LINEAGE_TOKENS) {
      for (const link of links.linksFor(token)) {
        const inheritedFromPlanNodeId = inheritedPlanNodeId(link);
        occurrences.push({
          token,
          id: link.resourceId,
          label: link.label,
          originToken: inheritedFromPlanNodeId ? "plan_node" : originToken,
          originId: inheritedFromPlanNodeId ?? originId,
          direct:
            !inheritedFromPlanNodeId &&
            preferred?.token === originToken &&
            preferred.id === originId,
          scratch: false,
          role: link.role,
        });
      }
    }
  };
  addLinks("web_page", args.webPageId, pageLinks);
  addLinks("plan_node", args.planNodeId, nodeLinks);
  addLinks("web_site", args.webSiteId, siteLinks);

  const scratchOrigin = args.scope === "site" ? "cms_site" : "cms_page";
  for (const id of scratchTopicIds) {
    occurrences.push({
      token: "research_topic",
      id,
      label: null,
      originToken: scratchOrigin,
      originId: args.cmsEntityId,
      direct: !preferred,
      scratch: true,
      role: null,
    });
  }
  for (const id of scratchTagIds) {
    occurrences.push({
      token: "research_tag",
      id,
      label: null,
      originToken: scratchOrigin,
      originId: args.cmsEntityId,
      direct: !preferred,
      scratch: true,
      role: null,
    });
  }

  const byKey = new Map<string, Occurrence[]>();
  for (const occurrence of occurrences) {
    const key = `${occurrence.token}:${occurrence.id}`;
    const current = byKey.get(key) ?? [];
    current.push(occurrence);
    byKey.set(key, current);
  }
  const titleRefs = [...byKey.values()].map((items) => {
    const first = items[0];
    if (!first)
      throw new Error("Research lineage group is unexpectedly empty.");
    return {
      token: first.token,
      id: first.id,
      label: items.find((item) => item.label)?.label,
    };
  });
  const titles = useEntityTitles(titleRefs);

  const rows: ContainerResourceRow[] = [...byKey.entries()].map(
    ([key, items]) => {
      const first = items[0];
      if (!first)
        throw new Error("Research lineage group is unexpectedly empty.");
      const direct =
        items.find((item) => item.direct) ?? items.find((item) => item.scratch);
      const originRefs = items
        .filter(
          (item): item is Occurrence & { originToken: AnchorToken } =>
            !item.direct &&
            (item.originToken === "web_site" ||
              item.originToken === "plan_node" ||
              item.originToken === "web_page"),
        )
        .map((item) => ({
          token: item.originToken,
          id: item.originId,
          label:
            item.originToken === "web_site"
              ? "site"
              : item.originToken === "plan_node"
                ? "content plan"
                : "canonical page",
        }))
        .filter(
          (origin, index, all) =>
            all.findIndex(
              (candidate) =>
                candidate.token === origin.token && candidate.id === origin.id,
            ) === index,
        );
      return {
        key,
        token: first.token,
        resourceId: first.id,
        label: items.find((item) => item.label)?.label ?? null,
        role: direct?.role ?? null,
        removable: Boolean(direct),
        originRefs,
      };
    },
  );

  const persist = async (topicIds: string[], tagIds: string[]) => {
    await args.persistScratch(topicIds, tagIds);
    setScratchOverride({
      sourceKey: scratchSourceKey,
      topicIds,
      tagIds,
    });
  };

  const adapter: ContainerResourcesAdapter = {
    status: statusFor([
      ...(args.webSiteId ? [siteLinks.status] : []),
      ...(args.planNodeId ? [nodeLinks.status] : []),
      ...(args.webPageId ? [pageLinks.status] : []),
      ...(!args.webSiteId && !args.planNodeId && !args.webPageId
        ? ["ready" as const]
        : []),
    ]),
    error: siteLinks.error ?? nodeLinks.error ?? pageLinks.error,
    reload: async () => {
      await Promise.all([
        siteLinks.reload(),
        nodeLinks.reload(),
        pageLinks.reload(),
      ]);
    },
    rows,
    attach: async (token, resourceId, title) => {
      if (token !== "research_topic" && token !== "research_tag") {
        return {
          ok: false,
          error: "Only research topics and tags belong in research lineage.",
        };
      }
      if (preferred) return preferred.links.attach(token, resourceId, title);
      const nextTopics =
        token === "research_topic"
          ? Array.from(new Set([...scratchTopicIds, resourceId]))
          : scratchTopicIds;
      const nextTags =
        token === "research_tag"
          ? Array.from(new Set([...scratchTagIds, resourceId]))
          : scratchTagIds;
      try {
        await persist(nextTopics, nextTags);
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : "Research lineage update failed.",
        };
      }
    },
    detach: async (token, resourceId, role) => {
      if (token !== "research_topic" && token !== "research_tag") {
        return {
          ok: false,
          error: "Only research topics and tags belong in research lineage.",
        };
      }
      const matches = byKey.get(`${token}:${resourceId}`) ?? [];
      const direct = matches.find((item) => item.direct && !item.scratch);
      if (preferred && direct) {
        return preferred.links.detach(
          token,
          resourceId,
          role ?? direct.role ?? undefined,
        );
      }
      if (matches.some((item) => item.scratch)) {
        try {
          await persist(
            token === "research_topic"
              ? scratchTopicIds.filter((id) => id !== resourceId)
              : scratchTopicIds,
            token === "research_tag"
              ? scratchTagIds.filter((id) => id !== resourceId)
              : scratchTagIds,
          );
          return { ok: true };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Research lineage update failed.",
          };
        }
      }
      return {
        ok: false,
        error: "This inherited research link must be changed at its origin.",
      };
    },
  };

  const entries: ResearchLineageEntry[] = [...byKey.values()].map((items) => {
    const first = items[0];
    if (!first)
      throw new Error("Research lineage group is unexpectedly empty.");
    return {
      token: first.token,
      id: first.id,
      title: titles.titleFor({
        token: first.token,
        id: first.id,
        label: items.find((item) => item.label)?.label,
      }),
      origins: items.map((item) => ({
        token: item.originToken,
        id: item.originId,
      })),
    };
  });

  const canPromoteScratch = Boolean(
    preferred && (scratchTopicIds.length > 0 || scratchTagIds.length > 0),
  );
  const promoteScratch = async (): Promise<{ ok: boolean; error?: string }> => {
    if (!preferred) {
      return {
        ok: false,
        error:
          "This CMS record has no canonical site, plan, or page anchor yet.",
      };
    }
    const candidates = [
      ...scratchTopicIds.map((id) => ({
        token: "research_topic" as const,
        id,
      })),
      ...scratchTagIds.map((id) => ({ token: "research_tag" as const, id })),
    ];
    const results = await Promise.all(
      candidates.map(({ token, id }) =>
        preferred.links.attach(token, id, titles.titleFor({ token, id })),
      ),
    );
    const failure = results.find((result) => !result.ok);
    if (failure) {
      return {
        ok: false,
        error:
          failure.error ?? "One or more research links could not be promoted.",
      };
    }
    try {
      await persist([], []);
      await preferred.links.reload();
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Canonical links were created, but the CMS draft links could not be cleared.",
      };
    }
  };

  return { adapter, entries, canPromoteScratch, promoteScratch };
}
