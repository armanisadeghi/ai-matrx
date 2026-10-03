// /administration/documentation/feature-maps — one door to every per-feature
// admin map (`/[feature]/admin`, contract in features/admin/FEATURE.md). The
// list is FEATURE_MAPS; its jest guard fails when a map page is added on disk
// without an entry here. Super-admin gating is the (admin) layout's job.
// Every row opens in a new tab, like every link on the maps themselves.

import { ExternalLink, Map as MapIcon } from "lucide-react";

import AppLink from "@/components/navigation/AppLink";
import { FEATURE_MAPS } from "@/features/admin/feature-maps/feature-map-registry";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata(
  "/administration/documentation/feature-maps",
  {
    titlePrefix: "Documentation",
    title: "Feature maps",
    letter: "Fm",
  },
);

export default function FeatureMapsPage() {
  return (
    <div className="h-full overflow-y-auto p-4">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {FEATURE_MAPS.map((map) => (
          <li key={map.href}>
            <AppLink
              href={map.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              <MapIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{map.label}</span>
                <span className="block truncate font-mono text-xs text-muted-foreground">
                  {map.href}
                </span>
              </span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </AppLink>
          </li>
        ))}
      </ul>
    </div>
  );
}
