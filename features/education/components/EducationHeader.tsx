"use client";

import {
  BookOpen,
  ChartNoAxesCombined,
  FilePlus2,
  GraduationCap,
  Library,
  Package,
  Target,
} from "lucide-react";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { RouteModeNav } from "@/features/shell/components/header/RouteModeNav";
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";

const EDUCATION_NAV_ITEMS = [
  {
    // "Home", not "Overview": this is the learner's workspace, and the label
    // must match what `EDU_WORKSPACE_LABEL` promises everywhere else.
    name: "Home",
    href: "/education/overview",
    icon: GraduationCap,
  },
  {
    name: "Create kit",
    href: "/education/start",
    icon: FilePlus2,
  },
  {
    name: "Kits",
    href: "/education/kits",
    icon: Package,
  },
  {
    name: "Library",
    href: "/education/library",
    icon: Library,
  },
  {
    name: "Guides",
    href: "/education/study-guides",
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
      // Keyed to the page on screen: the jobs this route runs, or no mark at
      // all (it used to list every education job on every education page).
      right={<IntelligenceIndicator feature="education" scope="route" label="This page" />}
      fallback
    />
  );
}
