"use client";

import { Boxes, CircleDollarSign, Globe2, Plug } from "lucide-react";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";

const WORKSPACE_ROUTES = [
  { name: "Sites", href: "/marketing/sites", icon: Globe2 },
  { name: "Connections", href: "/marketing/connections", icon: Plug },
  { name: "Batches", href: "/marketing/batches", icon: Boxes },
  { name: "Cost", href: "/marketing/cost", icon: CircleDollarSign },
];

export function MarketingWorkspaceNav() {
  return <RouteModeNav items={WORKSPACE_ROUTES} />;
}
