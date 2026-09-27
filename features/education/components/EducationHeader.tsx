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

export const EDUCATION_NAV_ITEMS = [
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

/**
 * What the collapsed section menu says on a page that is not one of the
 * sections above (a tool home such as Flashcards): the area, never "Menu".
 */
export const EDUCATION_NAV_FALLBACK_LABEL = "Education";

/** One responsive shell header shared by every Education route. */
export function EducationHeader() {
  return (
    <RouteHeader
      center={
        <RouteModeNav
          items={EDUCATION_NAV_ITEMS}
          fallbackLabel={EDUCATION_NAV_FALLBACK_LABEL}
        />
      }
      fallback
    />
  );
}
