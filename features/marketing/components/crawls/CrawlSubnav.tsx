"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  FileStack,
  Link2,
  ListTree,
  Network,
  PanelsTopLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CrawlSession } from "@/features/marketing/types";
import {
  formatCompactDate,
  StatusBadge,
} from "@/features/marketing/components/shared/MarketingUi";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";

export function CrawlSubnav({ crawl }: { crawl: CrawlSession }) {
  const pathname = usePathname();
  const { sitePath } = useMarketingSite();
  const root = `${sitePath}/crawls/${crawl.id}`;
  const items = [
    { label: "Summary", href: root, icon: Activity },
    { label: "URLs", href: `${root}/urls`, icon: Link2 },
    { label: "Reports", href: `${root}/reports`, icon: PanelsTopLeft },
    { label: "Snapshots", href: `${root}/snapshots`, icon: FileStack },
    { label: "Links", href: `${root}/links`, icon: Network },
    { label: "Logs", href: `${root}/logs`, icon: ListTree },
  ];
  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-lg border border-border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <StatusBadge value={crawl.status} />
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {crawl.id}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {crawl.trigger} ·{" "}
          {formatCompactDate(crawl.started_at ?? crawl.created_at)}
        </p>
      </div>
      <nav
        className="flex max-w-full shrink-0 items-center overflow-x-auto rounded-full border border-border bg-muted/40 p-0.5"
        aria-label="Crawl views"
      >
        {items.map((item) => {
          const active =
            item.href === root
              ? pathname === root
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
                active && "bg-background text-foreground shadow-sm",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
