"use client";

import {
  BookOpen,
  ChartNoAxesCombined,
  FilePlus2,
  GraduationCap,
  Library,
  Target,
} from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";

const EDUCATION_NAV_ITEMS = [
  {
    name: "Overview",
    href: "/education",
    icon: GraduationCap,
    exact: true,
  },
  {
    name: "Create kit",
    href: "/education/start",
    icon: FilePlus2,
  },
  {
    name: "Library",
    href: "/education/library",
    icon: Library,
  },
  {
    name: "Guides",
    href: "/education/learn",
    icon: BookOpen,
  },
  {
    name: "Plan",
    href: "/education/planner",
    icon: Target,
  },
  {
    name: "Progress",
    href: "/education/progress",
    icon: ChartNoAxesCombined,
  },
];

/** One responsive shell header shared by every Education route. */
export function EducationHeader() {
  return (
    <RouteHeader
      center={<RouteModeNav items={EDUCATION_NAV_ITEMS} />}
      fallback
    />
  );
}
