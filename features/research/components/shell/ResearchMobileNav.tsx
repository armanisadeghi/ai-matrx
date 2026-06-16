"use client";

import { useMemo } from "react";
import {
  LayoutDashboard,
  Globe,
  FileText,
  Tags,
  Search,
  Image,
  DollarSign,
  BookOpen,
  FlaskConical,
  Cpu,
  Settings2,
  Brain,
  ListChecks,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { RESEARCH_NAV_ITEMS } from "../../constants";
import { MobileDock, type DockItem } from "@/components/navigation/MobileDock";

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard,
  Globe,
  FileText,
  Tags,
  Search,
  Image,
  DollarSign,
  BookOpen,
  FlaskConical,
  Cpu,
  Settings2,
  Brain,
  ListChecks,
  Sparkles,
};

interface ResearchMobileNavProps {
  topicId: string;
}

export function ResearchMobileNav({ topicId }: ResearchMobileNavProps) {
  const dockItems = useMemo<DockItem[]>(
    () =>
      RESEARCH_NAV_ITEMS.map((item) => ({
        key: item.key,
        label: item.label,
        icon: ICON_MAP[item.icon] ?? LayoutDashboard,
        href: item.href(topicId),
        // Topic root must match exactly so it doesn't highlight for all sub-routes
        exactMatch: item.key === "topic",
        comingSoon: item.comingSoon,
      })),
    [topicId],
  );

  return <MobileDock items={dockItems} />;
}
