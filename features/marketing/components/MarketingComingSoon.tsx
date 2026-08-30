// features/marketing/components/MarketingComingSoon.tsx
//
// THE placeholder body for every reserved-but-unbuilt Marketing route.
// Server component, deliberately small and utilitarian — it is NOT a marketing
// page. It exists to (a) reserve the canonical URL so it never gets squatted at
// the app root again, (b) show the user where the product is going, and (c) tell
// the next agent exactly what to build and where the promise is recorded.
//
// Copy comes from ONE place: the `marketing.*` row in lib/coming-soon/registry.ts
// (the promise, and the label when nothing richer exists). An agency-plane route
// also has a matching entry in lib/marketing-nav.ts, which adds the pillar, the
// icon, and the live siblings; a CLIENT-workspace route (declared in
// brand-sections.ts instead) has none, and renders the promise alone.
// Route files pass only an id — never prose.

import Link from "next/link";
import {
  ArrowLeft,
  BadgeDollarSign,
  Boxes,
  CalendarDays,
  ChartNoAxesColumn,
  Circle,
  FileBarChart,
  Mail,
  MapPin,
  Megaphone,
  PenLine,
  Radar,
  Send,
  Share2,
  MessageSquareQuote,
  Swords,
  Target,
  TrendingUp,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { ComingSoonBadge } from "@/components/coming-soon/ComingSoonBadge";
import PageHeader from "@/features/shell/components/header/PageHeader";
import {
  MARKETING_PILLARS,
  type MarketingNavEntry,
  type MarketingNavPillar,
} from "@/features/marketing/lib/marketing-nav";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { getComingSoon } from "@/lib/coming-soon/registry";

const ICONS: Readonly<Record<string, LucideIcon>> = {
  BadgeDollarSign,
  Boxes,
  CalendarDays,
  ChartNoAxesColumn,
  FileBarChart,
  Mail,
  MapPin,
  Megaphone,
  PenLine,
  Radar,
  Send,
  Share2,
  MessageSquareQuote,
  Swords,
  Target,
  TrendingUp,
  Users,
  Workflow,
};

function findEntry(
  comingSoonId: string,
): { entry: MarketingNavEntry; pillar: MarketingNavPillar } | null {
  for (const pillar of MARKETING_PILLARS) {
    const entry = pillar.entries.find((e) => e.comingSoonId === comingSoonId);
    if (entry) return { entry, pillar };
  }
  return null;
}

export function MarketingComingSoon({
  comingSoonId,
}: {
  comingSoonId: string;
}) {
  const found = findEntry(comingSoonId);
  const promise = getComingSoon(comingSoonId);

  // The PROMISE is the load-bearing half, and it lives in one place. A reserved
  // route with no registry row is the exact failure this system exists to
  // prevent — say so loudly instead of rendering a convincing-looking stub.
  if (!promise) {
    throw new Error(
      `MarketingComingSoon: "${comingSoonId}" is missing its lib/coming-soon/registry.ts row. Every reserved Marketing route must be declared there.`,
    );
  }

  // MARKETING_PILLARS is the AGENCY plane's nav (2026-08-28 restructure); the
  // client workspace's reserved sections (`/marketing/[brandId]/socials`,
  // `…/identity/audience`, …) live in MARKETING_BRAND_SECTIONS instead and
  // carry no pillar entry. Their promise still renders — with no pillar label
  // and no sibling list, because neither exists at this level.
  const entry = found?.entry ?? null;
  const pillar = found?.pillar ?? null;
  const label = entry?.label ?? promise.label;
  const Icon = (entry ? ICONS[entry.iconName] : undefined) ?? Circle;

  // What the user can already do in this pillar instead of waiting.
  const liveSiblings =
    pillar && entry
      ? pillar.entries.filter(
          (e) => e.status !== "coming-soon" && e.href !== entry.href,
        )
      : [];

  return (
    <>
      {/* No PageHeader occupant — under the client tree the [brandId] layout's
          breadcrumb trail is the header, and it already names this section
          (Arman, 2026-08-30). The body card carries the promise + badge. */}
      <div className="h-full overflow-y-auto bg-textured">
        <div className="mx-auto w-full max-w-2xl px-4 pb-12 pt-[calc(var(--shell-header-h)+2rem)]">
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-6 w-6" aria-hidden />
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
              <ComingSoonBadge />
              {pillar ? (
                <span className="text-xs text-muted-foreground">
                  {pillar.label}
                </span>
              ) : null}
            </div>

            <h2 className="mb-2 text-xl font-semibold text-foreground">
              {label}
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {promise.promise}
            </p>

            <p className="mt-4 border-l-2 border-primary/40 py-0.5 pl-3 text-xs text-muted-foreground">
              This URL is reserved and permanent — it will not move when the
              feature ships. Tracked as{" "}
              <code className="font-mono">{promise.id}</code> in
              lib/coming-soon/registry.ts.
            </p>

            {liveSiblings.length > 0 ? (
              <div className="mt-6">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                  Available now in {pillar?.label}
                </p>
                <ul className="space-y-1.5">
                  {liveSiblings.map((sibling) => (
                    <li key={sibling.href}>
                      <Link
                        href={sibling.href}
                        className="text-sm text-primary hover:underline"
                      >
                        {sibling.label}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {sibling.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Link
              href={marketingRoutes.home()}
              className="mt-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              All Marketing
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
