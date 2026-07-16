"use client";

import { RouteTreeBreadcrumbHeader } from "@/features/shell/components/header/templates/RouteTreeBreadcrumbHeader";

export function DemosRouteHeader({ routes }: { routes: readonly string[] }) {
  return (
    <RouteTreeBreadcrumbHeader
      routes={routes}
      basePath="/demos"
      rootLabel="Demos"
      backHref="/dashboard"
    />
  );
}
