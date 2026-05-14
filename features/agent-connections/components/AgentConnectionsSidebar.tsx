"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectLiveAgents } from "@/features/agents/redux/agent-definition/selectors";
import { selectMcpCatalog } from "@/features/agents/redux/mcp/mcp.slice";
import {
  selectSkillDefinitionsCount,
  selectRenderDefinitionsCount,
  selectResourcesCount,
} from "../redux/skl/selectors";
import { SIDEBAR_SECTIONS } from "../constants";
import { sectionToHref, segmentToSection } from "../routing";
import type { AgentConnectionsSection } from "../types";

interface AgentConnectionsSidebarProps {
  /** Overlay/legacy mode — provide both to render <button>s with callbacks. */
  activeSection?: AgentConnectionsSection;
  onSelect?: (section: AgentConnectionsSection) => void;
  /** Route mode — provide a base path to render <Link>s. The active section
   *  is derived from `usePathname()`. */
  basePath?: string;
}

export function AgentConnectionsSidebar({
  activeSection: activeSectionProp,
  onSelect,
  basePath,
}: AgentConnectionsSidebarProps) {
  const agentsCount = useAppSelector(selectLiveAgents).length;
  const mcpCount = useAppSelector(selectMcpCatalog).length;
  const skillsCount = useAppSelector(selectSkillDefinitionsCount);
  const renderBlocksCount = useAppSelector(selectRenderDefinitionsCount);
  const resourcesCount = useAppSelector(selectResourcesCount);

  // In route mode the URL is the truth. Hooks must run unconditionally.
  const pathname = usePathname();
  const routeActiveSection = React.useMemo<AgentConnectionsSection>(() => {
    if (!basePath) return "overview";
    if (!pathname.startsWith(basePath)) return "overview";
    const rest = pathname.slice(basePath.length).replace(/^\//, "");
    const segment = rest.split("/")[0] || undefined;
    return segmentToSection(segment);
  }, [basePath, pathname]);

  const activeSection = basePath ? routeActiveSection : activeSectionProp;

  const countFor = (value: AgentConnectionsSection): number | null => {
    switch (value) {
      case "agents":
        return agentsCount;
      case "skills":
        return skillsCount;
      case "renderBlocks":
        return renderBlocksCount;
      case "resources":
        return resourcesCount;
      case "mcpServers":
        return mcpCount;
      default:
        return null;
    }
  };

  return (
    <ScrollArea className="flex-1 w-full">
      <div className="flex flex-col gap-0.5 p-2">
        {SIDEBAR_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = section.value === activeSection;
          const count = countFor(section.value);
          const itemClass = cn(
            "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
            isActive
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
          );
          const content = (
            <>
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1 truncate">{section.label}</span>
              {typeof count === "number" && count > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {count}
                </span>
              )}
            </>
          );

          if (basePath) {
            return (
              <Link
                key={section.value}
                href={sectionToHref(basePath, section.value)}
                className={itemClass}
                aria-current={isActive ? "page" : undefined}
                prefetch
              >
                {content}
              </Link>
            );
          }

          return (
            <button
              key={section.value}
              type="button"
              onClick={() => onSelect?.(section.value)}
              className={itemClass}
            >
              {content}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

export default AgentConnectionsSidebar;
