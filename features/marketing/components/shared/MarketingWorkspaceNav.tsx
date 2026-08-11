"use client";

import {
  Boxes,
  CircleDollarSign,
  Globe2,
  Landmark,
  Plug,
  SearchCheck,
  TrendingUp,
} from "lucide-react";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { marketingRoutes } from "@/features/marketing/lib/routes";

export const MARKETING_WORKSPACE_ROUTES = [
  { name: "Brands", href: marketingRoutes.brands(), icon: Landmark },
  { name: "Sites", href: marketingRoutes.sites(), icon: Globe2 },
  { name: "Search", href: marketingRoutes.searchConsole(), icon: SearchCheck },
  { name: "Ranks", href: marketingRoutes.ranks(), icon: TrendingUp },
  { name: "Connections", href: marketingRoutes.connections(), icon: Plug },
  { name: "Batches", href: marketingRoutes.batches(), icon: Boxes },
  { name: "Cost", href: marketingRoutes.cost(), icon: CircleDollarSign },
];

export function MarketingWorkspaceNav() {
  return <RouteModeNav items={MARKETING_WORKSPACE_ROUTES} />;
}
