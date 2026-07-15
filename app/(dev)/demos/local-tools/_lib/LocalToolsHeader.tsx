"use client";

import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { usePathname } from "next/navigation";
import { LOCAL_TOOLS_NAV_ITEMS } from "./localToolsNav";

export function LocalToolsHeader() {
  const pathname = usePathname();
  const isHub = pathname === "/demos/local-tools";

  return (
    <RouteHeader
      left={
        !isHub ? (
          <ChevronLeftTapButton
            href="/demos/local-tools"
            variant="transparent"
            ariaLabel="Back to Local Tools hub"
          />
        ) : undefined
      }
      center={<RouteModeNav items={LOCAL_TOOLS_NAV_ITEMS} />}
    />
  );
}
