"use client";

// Shared shell header for the /lists/v1 · v2 · v3 editor-variant family.
// One header, injected once per route (each page.tsx renders it), so the
// three sibling variants never diverge on chrome — only RouteModeNav's
// active item changes. Back goes to the /lists landing/chooser.
//
// Per core-route-headers doctrine: sibling routes sharing one concept get
// ONE shared header component (see features/cms/components/CmsHubHeader.tsx).

import { ListChecks, Rows3, FileText } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";

const MODES = [
  { name: "v1", href: "/lists/v1", icon: Rows3 },
  { name: "v2", href: "/lists/v2", icon: ListChecks },
  { name: "v3", href: "/lists/v3", icon: FileText },
];

export function PicklistEditorHeader() {
  return (
    <RouteHeader
      left={<ChevronLeftTapButton href="/lists" ariaLabel="Back to lists" />}
      center={<RouteModeNav items={MODES} />}
    />
  );
}
