"use client";

import {
  CircleDollarSign,
  ClipboardCheck,
  FileChartColumn,
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
  { name: "Approvals", href: marketingRoutes.approvals(), icon: ClipboardCheck },
  { name: "Connections", href: marketingRoutes.connections(), icon: Plug },
  { name: "Cost", href: marketingRoutes.cost(), icon: CircleDollarSign },
  { name: "Reports", href: marketingRoutes.reports(), icon: FileChartColumn },
];

export function MarketingWorkspaceNav() {
  return <RouteModeNav items={MARKETING_WORKSPACE_ROUTES} />;
}
