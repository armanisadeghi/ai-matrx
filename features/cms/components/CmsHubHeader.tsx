"use client";

// CmsHubHeader — the ONE shell header for the CMS hub level (`/cms` and
// `/cms/html-pages`). Center is the canonical section nav (RouteModeNav:
// Sites | Pages); callers pass their contextual action tap-buttons via
// `right`. No title text — the nav IS the identity.

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { FileCode, PanelTop } from "lucide-react";

const HUB_NAV_ITEMS = [
  { name: "Sites", href: "/cms", icon: PanelTop },
  { name: "Pages", href: "/cms/html-pages", icon: FileCode },
];

export function CmsHubHeader({ right }: { right?: React.ReactNode }) {
  return (
    <RouteHeader center={<RouteModeNav items={HUB_NAV_ITEMS} />} right={right} />
  );
}
