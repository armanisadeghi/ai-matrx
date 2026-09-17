"use client";

/**
 * The Content section's own header: the two things this section holds, as one
 * route nav. No title text — the nav IS the identity (core-route-headers).
 */

import { ListTree, Network } from "lucide-react";
import { usePathname } from "next/navigation";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export function TopicalMapHomeHeader() {
  const brand = useMarketingBrand();
  const pathname = usePathname();
  const mapHref = marketingRoutes.brandTopicalMapHome(brand.seg);
  const planHref = marketingRoutes.brandContentPlan(brand.seg);

  return (
    <RouteHeader
      center={
        <RouteModeNav
          items={[
            { name: "Topical map", href: mapHref, icon: Network },
            { name: "Content plan", href: planHref, icon: ListTree },
          ]}
          activeHref={pathname.includes("/content/plan") ? planHref : mapHref}
        />
      }
    />
  );
}
