"use client";

import type { MetricNavigationItem } from "@/components/navigation/MetricNavigation";
import { BrandsPortfolio } from "@/features/marketing/components/brands/BrandsPortfolio";
import type { MarketingNavPillar } from "@/features/marketing/lib/marketing-nav";

function destinationsFromPillars(
  pillars: readonly MarketingNavPillar[],
): MetricNavigationItem[] {
  return pillars.flatMap((pillar) =>
    pillar.entries.map((entry) => ({
      key: `${pillar.key}-${entry.href}`,
      label: entry.label,
      href: entry.href,
      iconName: entry.iconName,
      external: entry.external,
      availability: entry.status === "coming-soon" ? "coming-soon" : "ready",
      description: entry.description,
    })),
  );
}

/**
 * The agency-plane working home. The compact strip preserves the complete
 * registry map, while the portfolio below is the real client roster rather
 * than another navigation-card grid.
 */
export function MarketingHub({
  pillars,
}: {
  pillars: readonly MarketingNavPillar[];
}) {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-3 pb-6 pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-4">
        <BrandsPortfolio
          presentation="home"
          navigationItems={destinationsFromPillars(pillars)}
        />
      </div>
    </div>
  );
}
