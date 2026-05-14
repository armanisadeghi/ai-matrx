"use client";

import React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveSection } from "../redux/ui/slice";
import { OverviewSection } from "./sections/OverviewSection";
import { AgentsSection } from "./sections/AgentsSection";
import { SubAgentsSection } from "./sections/SubAgentsSection";
import { SkillsSection } from "./sections/SkillsSection";
import { RenderBlocksSection } from "./sections/RenderBlocksSection";
import { ResourcesSection } from "./sections/ResourcesSection";
import { InstructionsSection } from "./sections/InstructionsSection";
import { PromptsSection } from "./sections/PromptsSection";
import { CommandsSection } from "./sections/CommandsSection";
import { HooksSection } from "./sections/HooksSection";
import { McpServersSection } from "./sections/McpServersSection";
import { PluginsSection } from "./sections/PluginsSection";
import { RegistriesSection } from "./sections/RegistriesSection";
import { PreferencesSection } from "./sections/PreferencesSection";

export function AgentConnectionsBody() {
  const section = useAppSelector(selectActiveSection);
  switch (section) {
    case "overview":
      return <OverviewSection />;
    case "agents":
      return <AgentsSection />;
    case "subagents":
      return <SubAgentsSection />;
    case "skills":
      return <SkillsSection />;
    case "renderBlocks":
      return <RenderBlocksSection />;
    case "resources":
      return <ResourcesSection />;
    case "instructions":
      return <InstructionsSection />;
    case "prompts":
      return <PromptsSection />;
    case "commands":
      return <CommandsSection />;
    case "hooks":
      return <HooksSection />;
    case "mcpServers":
      return <McpServersSection />;
    case "plugins":
      return <PluginsSection />;
    case "registries":
      return <RegistriesSection />;
    case "preferences":
      return <PreferencesSection />;
    default:
      return null;
  }
}

export default AgentConnectionsBody;
