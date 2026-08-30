"use client";

/**
 * The client workspace's one piece of chrome: Marketing › <client brand> ›
 * <section>.
 *
 * It injects into the shell header as a FALLBACK portal (`<PageHeader fallback>`),
 * which is the same mounting contract `ScopesRouteHeader` uses at the org tier:
 * a page that mounts its own `RouteHeader` (the brand cockpit, the asset desk,
 * the discovery inbox) wins and this row hides itself, so no route ever shows
 * two headers. Everything else — the identity rooms, locations, settings — gets
 * a real trail instead of an anonymous page.
 *
 * The brand crumb carries a dropdown of the agency's other clients, because the
 * question "what else am I managing?" is asked from inside a client, not from
 * the roster. Links there are built with `marketingRoutes` and may carry UUIDs;
 * the brand layout canonicalizes them to the key address.
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronDown, ChevronRight } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import {
  MARKETING_BRAND_SECTIONS,
  type MarketingBrandSection,
} from "@/features/marketing/lib/brand-sections";
import { useBrandOptions } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { cn } from "@/lib/utils";

const CRUMB_LINK =
  "max-w-[10rem] truncate text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline sm:max-w-[14rem]";

/**
 * The section this pathname is in. `/marketing/<brand>` itself is the Overview
 * row (`slug: ""`), which the trail already says — so it resolves to null and
 * the trail stops at the brand.
 */
function useCurrentSection(): { name: string } | null {
  const pathname = usePathname() ?? "";
  const segments = pathname.split("/").filter(Boolean);
  // ["marketing", "<brandSeg>", "<section>", "<sub>", …]
  const sectionSeg = segments[2];
  if (!sectionSeg) return null;
  const candidates: MarketingBrandSection[] = MARKETING_BRAND_SECTIONS.filter(
    (section) => section.slug === sectionSeg,
  );
  if (candidates.length === 0) return null;
  const match =
    candidates.find((section) => section.subPath === segments[3]) ??
    candidates[0];
  return match ? { name: match.name } : null;
}

export function MarketingBrandCrumb() {
  const brand = useMarketingBrand();
  const section = useCurrentSection();
  // access-errors: ok — sibling-client switcher; a failed read only shrinks the
  // dropdown, and the brand itself is already resolved by the layout.
  const options = useBrandOptions(brand.organizationId);
  const siblings = (options.data ?? []).filter((row) => row.id !== brand.id);

  return (
    <PageHeader fallback>
      <nav
        aria-label="Breadcrumb"
        className="flex w-full min-w-0 items-center gap-1 text-sm"
      >
        <Link href={marketingRoutes.home()} className={CRUMB_LINK}>
          Marketing
        </Link>
        <ChevronRight
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50"
          aria-hidden
        />
        <span className="flex min-w-0 items-center gap-0.5">
          {section ? (
            <Link
              href={marketingRoutes.brand(brand.seg)}
              className={cn(CRUMB_LINK, "font-medium")}
            >
              {brand.name}
            </Link>
          ) : (
            <span
              aria-current="page"
              className="max-w-[10rem] truncate font-medium text-foreground sm:max-w-[14rem]"
            >
              {brand.name}
            </span>
          )}
          {siblings.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Switch client"
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[13rem]">
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Clients
                </DropdownMenuLabel>
                <div className="max-h-[60dvh] overflow-y-auto">
                  {(options.data ?? []).map((row) => {
                    const active = row.id === brand.id;
                    return (
                      <DropdownMenuItem
                        key={row.id}
                        asChild
                        className={cn(active && "bg-accent/60")}
                      >
                        <Link
                          href={marketingRoutes.brand(
                            active ? brand.seg : row.id,
                          )}
                          className="flex items-center gap-2"
                        >
                          <Check
                            className={cn(
                              "h-3.5 w-3.5 shrink-0",
                              active ? "text-primary opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="truncate">{row.name}</span>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </span>
        {section ? (
          <>
            <ChevronRight
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50"
              aria-hidden
            />
            <span
              aria-current="page"
              className="max-w-[10rem] truncate font-medium text-foreground sm:max-w-none"
            >
              {section.name}
            </span>
          </>
        ) : null}
      </nav>
    </PageHeader>
  );
}
