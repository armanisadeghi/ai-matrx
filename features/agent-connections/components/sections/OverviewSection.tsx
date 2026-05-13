"use client";

import React, { useState } from "react";
import { Star, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { OVERVIEW_CARDS } from "../../constants";
import type { AgentConnectionsSection } from "../../types";
import { selectLiveAgents } from "@/features/agents/redux/agent-definition/selectors";
import { selectMcpCatalog } from "@/features/agents/redux/mcp/mcp.slice";
import {
  selectSkillDefinitionsCount,
  selectRenderDefinitionsCount,
  selectResourcesCount,
} from "../../redux/skl/selectors";
import { useAgentConnectionsNav } from "../AgentConnectionsNavContext";

export function OverviewSection() {
  const { navigate } = useAgentConnectionsNav();
  const [prompt, setPrompt] = useState("");

  const agentsCount = useAppSelector(selectLiveAgents).length;
  const mcpCount = useAppSelector(selectMcpCatalog).length;
  const skillsCount = useAppSelector(selectSkillDefinitionsCount);
  const renderBlocksCount = useAppSelector(selectRenderDefinitionsCount);
  const resourcesCount = useAppSelector(selectResourcesCount);

  const countFor = (section: AgentConnectionsSection): number | null => {
    switch (section) {
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
      // subagents/commands/registries: counts wire in once their data
      // sources land (kind column, schema, registry sync).
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-6 px-8 py-6 max-w-5xl mx-auto w-full">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-foreground">
          Agent Connections
        </h1>
        <p className="text-sm text-muted-foreground max-w-3xl">
          Tailor how agents work in your projects. Configure workspace
          customizations for the entire team, or create personal ones that
          follow you across projects.
        </p>
      </header>

      <section
        className={cn(
          "rounded-xl border border-border bg-muted/20 p-5 flex flex-col gap-3",
        )}
      >
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-foreground" />
          <h2 className="text-base font-semibold text-foreground">
            Customize Your Agent
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Describe your preferences and conventions to draft agents, skills, and
          instructions.
        </p>
        <div className="relative">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Prefer concise commits, thorough reviews, and tested code..."
            className={cn(
              "w-full h-12 pl-4 pr-12 rounded-lg text-sm",
              "bg-background border border-border",
              "text-foreground placeholder:text-muted-foreground/60",
              "focus:outline-none focus:ring-1 focus:ring-ring",
            )}
          />
          <button
            type="button"
            disabled={!prompt.trim()}
            aria-label="Submit"
            className={cn(
              "absolute right-2 top-1/2 -translate-y-1/2",
              "inline-flex items-center justify-center h-8 w-8 rounded-md",
              "text-muted-foreground hover:text-foreground hover:bg-muted",
              "transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {OVERVIEW_CARDS.map((card) => {
          const Icon = card.icon;
          const actionLabel = card.action === "new" ? "New..." : "Browse...";
          const count = countFor(card.value);
          return (
            <button
              key={card.value}
              type="button"
              onClick={() => navigate(card.value)}
              className={cn(
                "group flex flex-col gap-3 rounded-xl border border-border",
                "bg-background p-5 text-left transition-colors",
                "hover:bg-muted/40 hover:border-border/80",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-4 w-4 text-foreground" />
                <span className="text-base font-semibold text-foreground flex-1">
                  {card.label}
                </span>
                {typeof count === "number" && count > 0 && (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {count}
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground leading-snug">
                {card.description}
              </p>
              <span
                className={cn(
                  "mt-auto text-sm text-sky-500 group-hover:text-sky-400 group-hover:underline",
                )}
              >
                {actionLabel}
              </span>
            </button>
          );
        })}
      </section>
    </div>
  );
}

export default OverviewSection;
