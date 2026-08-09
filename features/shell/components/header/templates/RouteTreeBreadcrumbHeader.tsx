"use client";

import { usePathname } from "next/navigation";
import {
  CrumbTrailHeader,
  type Crumb,
  type CrumbOption,
} from "@/features/shell/components/header/templates/CrumbTrailHeader";
import { formatTitleCase } from "@/utils/text/text-case-converter";

export interface RouteTreeBreadcrumbHeaderProps {
  /** Relative route paths, such as `tests/buttons/variants`. */
  routes: readonly string[];
  /** URL prefix represented by the route tree, such as `/demos`. */
  basePath: string;
  /** Label for the root crumb. */
  rootLabel: string;
  /** Destination for the root-level back affordance. */
  backHref: string;
  /** Yield to any page-specific header mounted deeper in the route tree. */
  fallback?: boolean;
}

function normalizePath(path: string) {
  return path.replace(/^\/+|\/+$/g, "");
}

function toHref(basePath: string, segments: readonly string[]) {
  return segments.length === 0
    ? basePath
    : `${basePath}/${segments.join("/")}`;
}

function formatSegment(segment: string) {
  return formatTitleCase(segment.replace(/[\[\].]/g, " ").trim());
}

/**
 * Builds an AppShell breadcrumb from a filesystem-discovered route tree.
 *
 * Each breadcrumb level shows its direct sibling segments in the shared
 * `CrumbTrailHeader` dropdown, so a route tree gains scope-style drill-down
 * navigation without maintaining a parallel menu definition.
 */
export function RouteTreeBreadcrumbHeader({
  routes,
  basePath,
  rootLabel,
  backHref,
  fallback = false,
}: RouteTreeBreadcrumbHeaderProps) {
  const pathname = usePathname() ?? basePath;
  const normalizedBase = `/${normalizePath(basePath)}`;
  const relativePath = pathname.startsWith(normalizedBase)
    ? pathname.slice(normalizedBase.length)
    : "";
  const activeSegments = normalizePath(relativePath)
    .split("/")
    .filter(Boolean);
  const routeSegments = routes.map((route) => normalizePath(route).split("/"));

  const siblingOptions = (parent: readonly string[], active?: string): CrumbOption[] => {
    const candidates = new Map<string, string[]>();

    for (const route of routeSegments) {
      if (
        route.length <= parent.length ||
        !parent.every((segment, index) => route[index] === segment)
      ) {
        continue;
      }

      const segment = route[parent.length];
      if (segment && !candidates.has(segment)) {
        candidates.set(segment, [...parent, segment]);
      }
    }

    return [...candidates.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([segment, target]) => ({
        label: formatSegment(segment),
        href: toHref(normalizedBase, target),
        active: segment === active,
      }));
  };

  const trail: Crumb[] = [
    {
      label: rootLabel,
      href: activeSegments.length > 0 ? normalizedBase : undefined,
      options: siblingOptions([]),
      optionsLabel: `${rootLabel} sections`,
    },
    ...activeSegments.map((segment, index) => {
      const target = activeSegments.slice(0, index + 1);
      const isLast = index === activeSegments.length - 1;
      return {
        label: formatSegment(segment),
        href: isLast ? undefined : toHref(normalizedBase, target),
        options: siblingOptions(activeSegments.slice(0, index), segment),
        optionsLabel: `${formatSegment(activeSegments[index - 1] ?? rootLabel)} options`,
      };
    }),
  ];

  return (
    <CrumbTrailHeader
      backHref={backHref}
      trail={trail}
      fallback={fallback}
    />
  );
}
