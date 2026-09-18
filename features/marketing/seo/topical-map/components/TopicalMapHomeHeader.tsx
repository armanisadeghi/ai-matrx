"use client";

/**
 * The Content section's own header: the two things this section holds, as one
 * route nav, and the one action the home offers — start a map. No title text;
 * the nav IS the identity (core-route-headers).
 */

import Link from "next/link";
import { BrainCircuit, ListTree, Network } from "lucide-react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";

import { startMapHref } from "./TopicalMapHome";

export function TopicalMapHomeHeader() {
  const brand = useMarketingBrand();
  const pathname = usePathname();
  const mapHref = marketingRoutes.brandTopicalMapHome(brand.seg);
  const planHref = marketingRoutes.brandContentPlan(brand.seg);
  const onPlan = pathname.includes("/content/plan");

  return (
    <RouteHeader
      center={
        <RouteModeNav
          items={[
            { name: "Topical map", href: mapHref, icon: Network },
            { name: "Content plan", href: planHref, icon: ListTree },
          ]}
          activeHref={onPlan ? planHref : mapHref}
        />
      }
      right={
        onPlan ? undefined : (
          <Button asChild size="sm" variant="ghost" className="gap-1.5">
            <Link href={startMapHref(brand.seg)}>
              <BrainCircuit className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Start a map</span>
            </Link>
          </Button>
        )
      }
    />
  );
}
