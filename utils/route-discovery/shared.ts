import { formatTitleCase } from "@ai-matrx/kit/text-case";
import type { ModulePage } from "@/components/matrx/navigation/types";

export function groupRoutes(
  routes: string[],
): Record<string, string[]> {
  const groups: Record<string, string[]> = {};

  const parentSegments = new Set(
    routes.filter((r) => r.includes("/")).map((r) => r.split("/")[0]),
  );

  for (const route of routes) {
    const parts = route.split("/");
    const isTopLevel = parts.length === 1;

    if (isTopLevel && parentSegments.has(route)) {
      if (!groups[route]) groups[route] = [];
      groups[route].unshift(route);
    } else {
      const groupKey = parts.length > 1 ? parts[0] : "__root__";
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(route);
    }
  }

  return groups;
}

export function getRouteLabel(route: string, groupKey: string): string {
  if (groupKey === "__root__") return formatTitleCase(route);
  if (route === groupKey) return `${formatTitleCase(route)} (overview)`;

  const childParts = route.split("/").slice(1);
  return childParts.length > 0
    ? childParts.map((part) => formatTitleCase(part)).join(" / ")
    : formatTitleCase(route.split("/")[0]);
}

export function toModulePages(
  routes: string[],
  moduleHome: string,
): ModulePage[] {
  return routes.map((route) => ({
    title: formatTitleCase(route.split("/").pop() ?? route),
    path: route,
    relative: true,
    description: "",
  }));
}

export function sortGroupKeys(keys: string[]): string[] {
  return [...keys].sort((a, b) => {
    if (a === "__root__") return -1;
    if (b === "__root__") return 1;
    return a.localeCompare(b);
  });
}
