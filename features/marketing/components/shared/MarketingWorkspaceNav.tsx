"use client";

import {
  Boxes,
  CircleDollarSign,
  Globe2,
  Landmark,
  Plug,
  SearchCheck,
} from "lucide-react";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";

const WORKSPACE_ROUTES = [
  { name: "Brands", href: "/marketing/brands", icon: Landmark },
  { name: "Sites", href: "/marketing/sites", icon: Globe2 },
  { name: "Search", href: "/marketing/search-console", icon: SearchCheck },
  { name: "Connections", href: "/marketing/connections", icon: Plug },
  { name: "Batches", href: "/marketing/batches", icon: Boxes },
  { name: "Cost", href: "/marketing/cost", icon: CircleDollarSign },
];

export function MarketingWorkspaceNav() {
  return <RouteModeNav items={WORKSPACE_ROUTES} />;
}
