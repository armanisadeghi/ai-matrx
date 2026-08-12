"use client";

import { LayoutDashboard, MessagesSquare } from "lucide-react";
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
];

/** One responsive shell header shared by every user-facing AI Work route. */
export function AiWorkHeader() {
  return <RouteHeader center={<RouteModeNav items={AI_WORK_NAV_ITEMS} />} />;
}
