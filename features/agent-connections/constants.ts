import {
  Home,
  Hexagon,
  Brain,
  Lightbulb,
  Blocks,
  FolderOpen,
  BookOpen,
  Bookmark,
  TerminalSquare,
  Zap,
  Server,
  Plug,
  Library,
  Sliders,
} from "lucide-react";
import type { OverviewCard, SidebarSection } from "./types";

export const SIDEBAR_SECTIONS: SidebarSection[] = [
  { value: "overview", label: "Overview", icon: Home },
  { value: "agents", label: "Agents", icon: Hexagon },
  { value: "subagents", label: "Sub-agents", icon: Brain, urlSegment: "sub-agents" },
  { value: "skills", label: "Skills", icon: Lightbulb },
  { value: "renderBlocks", label: "Render Blocks", icon: Blocks, urlSegment: "render-blocks" },
  { value: "resources", label: "Resources", icon: FolderOpen },
  { value: "instructions", label: "Instructions", icon: BookOpen },
  { value: "prompts", label: "Prompts", icon: Bookmark },
  { value: "commands", label: "Commands", icon: TerminalSquare },
  { value: "hooks", label: "Hooks", icon: Zap },
  { value: "mcpServers", label: "MCP Servers", icon: Server, urlSegment: "mcp-servers" },
  { value: "plugins", label: "Plugins", icon: Plug },
  { value: "registries", label: "Registries", icon: Library },
  { value: "preferences", label: "Preferences", icon: Sliders },
];

export const OVERVIEW_CARDS: OverviewCard[] = [
  {
    value: "agents",
    label: "Agents",
    icon: Hexagon,
    description:
      "Define custom agents with specialized personas, tool access, and instructions for specific tasks.",
    action: "new",
  },
  {
    value: "subagents",
    label: "Sub-agents",
    icon: Brain,
    description:
      "Specialist agents invoked by other agents for focused tasks like reviewing code, debugging, or optimizing performance.",
    action: "new",
  },
  {
    value: "skills",
    label: "Skills",
    icon: Lightbulb,
    description:
      "Create reusable skill files that provide domain-specific knowledge and workflows.",
    action: "new",
  },
  {
    value: "renderBlocks",
    label: "Render Blocks",
    icon: Blocks,
    description:
      "Structured LLM output templates that map 1:1 to React renderer components across every surface.",
    action: "new",
  },
  {
    value: "resources",
    label: "Resources",
    icon: FolderOpen,
    description:
      "Scripts, references, and assets attached to skills that load only when the skill is invoked.",
    action: "browse",
  },
  {
    value: "instructions",
    label: "Instructions",
    icon: BookOpen,
    description:
      "Set always-on instructions that guide AI behavior across your workspace or user profile.",
    action: "new",
  },
  {
    value: "hooks",
    label: "Hooks",
    icon: Zap,
    description:
      "Configure automated actions triggered by events like saving files or running tasks.",
    action: "new",
  },
  {
    value: "mcpServers",
    label: "MCP Servers",
    icon: Server,
    description:
      "Connect external tool servers that extend AI capabilities with custom tools and data sources.",
    action: "browse",
  },
  {
    value: "commands",
    label: "Commands",
    icon: TerminalSquare,
    description:
      "Slash commands that wrap a prompt + tools so you can invoke a workflow with a single keyword.",
    action: "new",
  },
  {
    value: "plugins",
    label: "Plugins",
    icon: Plug,
    description:
      "Install and manage agent plugins that add additional tools, skills, and integrations.",
    action: "browse",
  },
  {
    value: "registries",
    label: "Registries",
    icon: Library,
    description:
      "Connect external sources like the Vercel plugin or Anthropic skills repos to discover and install community items.",
    action: "browse",
  },
];

export const SKILL_TYPES = [
  "render_block",
  "convention",
  "workflow",
  "task",
  "reference",
  "mode",
  "agent_behavior",
] as const;

export type SkillType = (typeof SKILL_TYPES)[number];

export const SKILL_TYPE_LABELS: Record<SkillType, string> = {
  render_block: "Render Block",
  convention: "Convention",
  workflow: "Workflow",
  task: "Task",
  reference: "Reference",
  mode: "Mode",
  agent_behavior: "Agent Behavior",
};
