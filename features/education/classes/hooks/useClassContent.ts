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
import { isEntityTypeToken, type EntityTypeToken } from "@ai-matrx/associations";
import { educationEntityRoute } from "@/features/education/data/entityRoutes";
import { CLASS_CONTENT_TOKENS } from "../constants";
import { classContentLinks, classPartIds, titleHintFromEdgeLabel } from "../classParts";
import { classTestLinks } from "../classTests";
import type { ContainerLink } from "@ai-matrx/associations/react";
import type { ClassContentItem } from "../types";

export interface ClassContentGroup {
  group: string;
  items: ClassContentItem[];
}

export interface UseClassContentReturn {
  groups: ClassContentGroup[];
  totalCount: number;
  loading: boolean;
  /** Why the class-content read failed (null when it succeeded). */
  error: string | null;
  attach: ReturnType<typeof useContainerLinks>["attach"];
  detach: ReturnType<typeof useContainerLinks>["detach"];
  /** Attached ids keyed `${token}:${id}` (for the picker's attached state). */
  attachedKeys: Set<string>;
  /** The class's parts (units, lessons, sections) — sources of its `part_of` edges. */
  partIds: string[];
  /** The class's tests — its `part_of` edges marked as tests (never units, never content). */
  testLinks: ContainerLink[];
  /** The class container's link store (parts attach/detach through it). */
  links: ReturnType<typeof useContainerLinks>;
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

  // Every incoming edge, whatever its token: a class keeps taking sources after
  // it is made (web pages, transcripts, files, notes…), and a source the
  // education map does not curate still lists (it opens through the platform
  // registry's door). Assignment edges (role='assignment') are a DIFFERENT
  // concern (the assignments panel reads them via edu_class_assignments) and the
  // class's own parts are `scope` sources — `classContentLinks` drops both.
  const allLinks = links.presentTokens
    .filter(isEntityTypeToken)
    .flatMap((token) => links.linksFor(token));
  // Education's own tokens first, in their display order; every other source after.
  const rank = (token: string) => {
    const i = CLASS_CONTENT_TOKENS.indexOf(token as EntityTypeToken);
    return i === -1 ? CLASS_CONTENT_TOKENS.length : i;
  };
  const rows = classContentLinks(allLinks).sort((a, b) => rank(a.token) - rank(b.token));
  const partIds = classPartIds(allLinks);
  const testLinks = classTestLinks(allLinks);

  const hint = (r: (typeof rows)[number]) => titleHintFromEdgeLabel(r.token, r.label);
  const { titleFor, loading: titlesLoading } = useEntityTitles(
    rows.map((r) => ({ token: r.token, id: r.resourceId, label: hint(r) })),
  );

  const items: ClassContentItem[] = rows.map((r) => {
    const route = educationEntityRoute(r.token);
    return {
      edgeId: r.edgeId,
      token: r.token,
      entityId: r.resourceId,
      title: titleFor({ token: r.token, id: r.resourceId, label: hint(r) }),
      href: route.href(r.resourceId),
      Icon: route.Icon,
      group: route.group,
    };
  });

  // Group in the token display order (rows are sorted by CLASS_CONTENT_TOKENS rank).
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
    // Count only the content edges we actually surface (assignment edges excluded).
    totalCount: rows.length,
    loading: links.status === "loading" || titlesLoading,
    error: links.error,
    attach: links.attach,
    detach: links.detach,
    attachedKeys,
    partIds,
    testLinks,
    links,
    reload: links.reload,
  };
}

/** The tokens a class hub can attach (typed for the association picker). */
export const CLASS_PICKER_TOKENS: EntityTypeToken[] = CLASS_CONTENT_TOKENS;
