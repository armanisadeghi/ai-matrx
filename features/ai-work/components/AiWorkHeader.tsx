"use client";

import { LayoutDashboard, MessagesSquare, Plug } from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";

const AI_WORK_NAV_ITEMS = [
  {
    name: "Overview",
    href: "/work",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    name: "Conversations",
    href: "/work/conversations",
    icon: MessagesSquare,
  },
  {
    name: "Connections",
    href: "/work/connections",
    icon: Plug,
  },
];

/** One responsive shell header shared by every user-facing AI Work route. */
export function AiWorkHeader() {
  return <RouteHeader center={<RouteModeNav items={AI_WORK_NAV_ITEMS} />} />;
}
