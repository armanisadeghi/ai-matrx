// features/education/classes/hooks/useClassContent.ts
//
// The class hub's aggregation: everything tagged to a class = the class scope's
// INCOMING platform.associations edges. This is a thin, education-facing view
// over the canonical `useContainerLinks({ containerType: 'scope' })` primitive
// (the same edge War Room / org-home cards read) + `useEntityTitles` for real
// names + the education entity→route map. It invents no aggregation of its own.

"use client";

import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";
import { educationEntityRoute } from "@/features/education/data/entityRoutes";
import { CLASS_CONTENT_TOKENS } from "../constants";
import type { ClassContentItem } from "../types";

export interface ClassContentGroup {
  group: string;
  items: ClassContentItem[];
}

export interface UseClassContentReturn {
  groups: ClassContentGroup[];
  totalCount: number;
  loading: boolean;
  attach: ReturnType<typeof useContainerLinks>["attach"];
  detach: ReturnType<typeof useContainerLinks>["detach"];
  /** Attached ids keyed `${token}:${id}` (for the picker's attached state). */
  attachedKeys: Set<string>;
  reload: () => Promise<void>;
}

export function useClassContent(
  classId: string | null,
  orgId?: string | null,
): UseClassContentReturn {
  const links = useContainerLinks({
    containerType: "scope",
    containerId: classId,
    orgId,
  });

  // Flatten every incoming edge across the education content tokens. Each
  // ContainerLink already carries its `token`.
  const rows = CLASS_CONTENT_TOKENS.flatMap((token) => links.linksFor(token));

  const { titleFor, loading: titlesLoading } = useEntityTitles(
    rows.map((r) => ({ token: r.token, id: r.resourceId, label: r.label })),
  );

  const items: ClassContentItem[] = rows.map((r) => {
    const route = educationEntityRoute(r.token);
    return {
      edgeId: r.edgeId,
      token: r.token,
      entityId: r.resourceId,
      title: titleFor({ token: r.token, id: r.resourceId, label: r.label }),
      href: route.href(r.resourceId),
      Icon: route.Icon,
      group: route.group,
    };
  });

  // Group in the token display order (CLASS_CONTENT_TOKENS drives the order).
  const groupOrder: string[] = [];
  const byGroup = new Map<string, ClassContentItem[]>();
  for (const item of items) {
    let bucket = byGroup.get(item.group);
    if (!bucket) {
      bucket = [];
      byGroup.set(item.group, bucket);
      groupOrder.push(item.group);
    }
    bucket.push(item);
  }
  const groups: ClassContentGroup[] = groupOrder.map((group) => ({
    group,
    items: (byGroup.get(group) ?? []).sort((a, b) =>
      a.title.localeCompare(b.title),
    ),
  }));

  const attachedKeys = new Set(
    rows.map((r) => `${r.token}:${r.resourceId}`),
  );

  return {
    groups,
    totalCount: links.totalCount,
    loading: links.status === "loading" || titlesLoading,
    attach: links.attach,
    detach: links.detach,
    attachedKeys,
    reload: links.reload,
  };
}

/** The tokens a class hub can attach (typed for the association picker). */
export const CLASS_PICKER_TOKENS: EntityTypeToken[] = CLASS_CONTENT_TOKENS;
