"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectLiveAgents } from "@/features/agents/redux/agent-definition/selectors";
import { selectMcpCatalog } from "@/features/agents/redux/mcp/mcp.slice";
import { selectSkillsCount } from "@/features/skills/redux/skillsSelectors";
import {
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
  const [query, setQuery] = useState("");

  const agentsCount = useAppSelector(selectLiveAgents).length;
  const mcpCount = useAppSelector(selectMcpCatalog).length;
  const skillsCount = useAppSelector(selectSkillsCount);
  const renderBlocksCount = useAppSelector(selectRenderDefinitionsCount);
  const resourcesCount = useAppSelector(selectResourcesCount);

  // In route mode the URL is the truth. Hooks must run unconditionally.
  const pathname = usePathname();
  const routeActiveSection = useMemo<AgentConnectionsSection>(() => {
    if (!basePath) return "overview";
    if (!pathname.startsWith(basePath)) return "overview";
    const rest = pathname.slice(basePath.length).replace(/^\//, "");
    const segment = rest.split("/")[0] || undefined;
    return segmentToSection(segment);
  }, [basePath, pathname]);

  const activeSection = basePath ? routeActiveSection : activeSectionProp;

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SIDEBAR_SECTIONS;
    return SIDEBAR_SECTIONS.filter((s) =>
      s.label.toLowerCase().includes(q),
    );
  }, [query]);

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
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 px-2 pt-2 pb-2 border-b border-border/60">
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all sections…"
            aria-label="Search all sections"
            className={cn(
              "w-full h-8 pl-7 pr-7 text-xs rounded-md",
              "bg-background border border-border",
              "text-foreground placeholder:text-muted-foreground/70",
              "focus:outline-none focus:ring-1 focus:ring-ring",
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/60"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1 w-full">
        <div className="flex flex-col gap-0.5 p-2">
          {filteredSections.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              No sections match.
            </div>
          ) : (
            filteredSections.map((section) => {
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
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

export default AgentConnectionsSidebar;
