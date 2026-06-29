"use client";

import React, { useMemo, useState } from "react";
import {
  Sliders,
  Bell,
  Shield,
  Briefcase,
  FolderKanban,
  ListChecks,
  Package,
  Hexagon,
  Globe,
} from "lucide-react";
import { Github } from "@/components/icons/brand-icons";
import { SectionToolbar } from "../SectionToolbar";
import { SectionFooter } from "../SectionFooter";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsCheckbox } from "@/components/official/settings/primitives/SettingsCheckbox";
import { SettingsSegmented } from "@/components/official/settings/primitives/SettingsSegmented";
import { SettingsRadioGroup } from "@/components/official/settings/primitives/SettingsRadioGroup";
import { SettingsSlider } from "@/components/official/settings/primitives/SettingsSlider";
import { SettingsNumberInput } from "@/components/official/settings/primitives/SettingsNumberInput";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsProTextarea } from "@/components/official/settings/primitives/SettingsProTextarea";
import { SettingsTailwindColor } from "@/components/official/settings/primitives/SettingsTailwindColor";
import { SettingsMultiSelect } from "@/components/official/settings/primitives/SettingsMultiSelect";
import {
  SettingsKeybinding,
  type KeybindingValue,
} from "@/components/official/settings/primitives/SettingsKeybinding";
import { useSetting } from "@/features/settings/hooks/useSetting";
import type { AgentConnectionsShortcut } from "@/lib/redux/preferences/userPreferencesSlice";

const SCOPE_OPTIONS = [
  { value: "user", label: "Personal" },
  { value: "organization", label: "Org" },
  { value: "project", label: "Project" },
  { value: "task", label: "Task" },
] as const;

const DENSITY_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
] as const;

const SIDEBAR_STYLE_OPTIONS = [
  {
    value: "icons",
    label: "Icons only",
    description: "Narrow rail — just the section icons.",
  },
  {
    value: "labels",
    label: "Labels + counts",
    description: "Icon and label, plus item counts on the right.",
  },
  {
    value: "full",
    label: "Full details",
    description: "Same as Labels, plus inline descriptions on hover.",
  },
] as const;

const REGISTRY_OPTIONS = [
  { value: "vercel", label: "Vercel Plugin", icon: Package },
  { value: "anthropic", label: "Anthropic Skills", icon: Hexagon },
  { value: "github", label: "GitHub Awesome MCP", icon: Github },
  { value: "community", label: "Community Mirror", icon: Globe },
] as const;

/**
 * Each group declares its setting labels so the toolbar search can decide
 * whether to render the group (any label match → show the whole group).
 */
interface SettingsGroup {
  key: string;
  title: string;
  searchTerms: string[];
}

const GROUP_INDEX: SettingsGroup[] = [
  {
    key: "notifications",
    title: "Notifications & safety",
    searchTerms: [
      "notify on agent connect",
      "auto-reconnect dropped agents",
      "confirm destructive actions",
    ],
  },
  {
    key: "defaults",
    title: "Defaults",
    searchTerms: ["default scope", "density", "sidebar style"],
  },
  {
    key: "behavior",
    title: "Behavior",
    searchTerms: ["auto-save delay", "max concurrent agents"],
  },
  {
    key: "workspace",
    title: "Workspace",
    searchTerms: ["workspace display name", "welcome message", "accent color"],
  },
  {
    key: "integrations",
    title: "Integrations",
    searchTerms: ["enabled registries", "quick toggle shortcut"],
  },
];

function groupMatches(group: SettingsGroup, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (group.title.toLowerCase().includes(q)) return true;
  return group.searchTerms.some((t) => t.includes(q));
}

export function PreferencesSection() {
  const [search, setSearch] = useState("");

  const [notifyOnConnect, setNotifyOnConnect] = useSetting<boolean>(
    "userPreferences.agentConnections.notifyOnConnect",
  );
  const [autoReconnect, setAutoReconnect] = useSetting<boolean>(
    "userPreferences.agentConnections.autoReconnect",
  );
  const [confirmDestructive, setConfirmDestructive] = useSetting<boolean>(
    "userPreferences.agentConnections.confirmDestructive",
  );
  const [defaultScope, setDefaultScope] = useSetting<
    "user" | "organization" | "project" | "task"
  >("userPreferences.agentConnections.defaultScope");
  const [densityMode, setDensityMode] = useSetting<
    "compact" | "comfortable" | "spacious"
  >("userPreferences.agentConnections.densityMode");
  const [sidebarStyle, setSidebarStyle] = useSetting<
    "icons" | "labels" | "full"
  >("userPreferences.agentConnections.sidebarStyle");
  const [autoSaveDelayMs, setAutoSaveDelayMs] = useSetting<number>(
    "userPreferences.agentConnections.autoSaveDelayMs",
  );
  const [maxConcurrentAgents, setMaxConcurrentAgents] = useSetting<number>(
    "userPreferences.agentConnections.maxConcurrentAgents",
  );
  const [workspaceName, setWorkspaceName] = useSetting<string>(
    "userPreferences.agentConnections.workspaceName",
  );
  const [welcomeMessage, setWelcomeMessage] = useSetting<string>(
    "userPreferences.agentConnections.welcomeMessage",
  );
  const [accentColor, setAccentColor] = useSetting<string>(
    "userPreferences.agentConnections.accentColor",
  );
  const [enabledRegistries, setEnabledRegistries] = useSetting<string[]>(
    "userPreferences.agentConnections.enabledRegistries",
  );
  const [quickToggleShortcut, setQuickToggleShortcut] =
    useSetting<AgentConnectionsShortcut | null>(
      "userPreferences.agentConnections.quickToggleShortcut",
    );

  const visibleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return new Set(
      GROUP_INDEX.filter((g) => groupMatches(g, q)).map((g) => g.key),
    );
  }, [search]);

  const nothingFound = visibleGroups.size === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      <SectionToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search preferences…"
      />

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <SettingsSubHeader
          title="Preferences"
          description="Personal preferences for how Agent Connections behaves across your workspaces."
          icon={Sliders}
        />

        <SettingsCallout tone="info" title="Synced to your account">
          Changes here save automatically and follow you across devices.
        </SettingsCallout>

        {nothingFound && (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            No preferences match your search.
          </div>
        )}

        {visibleGroups.has("notifications") && (
          <SettingsSection title="Notifications & safety" icon={Bell}>
            <SettingsSwitch
              label="Notify on agent connect"
              description="Show a toast when an agent comes online in this workspace."
              checked={notifyOnConnect}
              onCheckedChange={setNotifyOnConnect}
            />
            <SettingsSwitch
              label="Auto-reconnect dropped agents"
              description="Re-establish connections automatically when an agent disconnects."
              checked={autoReconnect}
              onCheckedChange={setAutoReconnect}
            />
            <SettingsCheckbox
              label="Confirm destructive actions"
              description="Require a confirmation dialog before delete, revoke, or reset."
              checked={confirmDestructive}
              onCheckedChange={setConfirmDestructive}
              last
            />
          </SettingsSection>
        )}

        {visibleGroups.has("defaults") && (
          <SettingsSection title="Defaults" icon={Shield}>
            <SettingsSegmented
              label="Default scope"
              description="Which scope is selected when you open Agent Connections."
              value={defaultScope}
              onValueChange={setDefaultScope}
              options={SCOPE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              size="sm"
            />
            <SettingsSegmented
              label="Density"
              description="Spacing between rows in list views."
              value={densityMode}
              onValueChange={setDensityMode}
              options={DENSITY_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
              size="sm"
            />
            <SettingsRadioGroup
              label="Sidebar style"
              description="Trade visual weight for information density."
              value={sidebarStyle}
              onValueChange={setSidebarStyle}
              options={SIDEBAR_STYLE_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
                description: o.description,
              }))}
              last
            />
          </SettingsSection>
        )}

        {visibleGroups.has("behavior") && (
          <SettingsSection title="Behavior" icon={ListChecks}>
            <SettingsSlider
              label="Auto-save delay"
              description="How long to wait after a change before persisting."
              value={autoSaveDelayMs}
              onValueChange={setAutoSaveDelayMs}
              min={0}
              max={5000}
              step={50}
              unit="ms"
              minLabel="Instant"
              midLabel="Balanced"
              maxLabel="Slow"
            />
            <SettingsNumberInput
              label="Max concurrent agents"
              description="Upper bound for how many agents can run at once in a workspace."
              value={maxConcurrentAgents}
              onValueChange={setMaxConcurrentAgents}
              min={1}
              max={32}
              integer
              last
            />
          </SettingsSection>
        )}

        {visibleGroups.has("workspace") && (
          <SettingsSection title="Workspace" icon={Briefcase}>
            <SettingsTextInput
              label="Workspace display name"
              description="Shown at the top of the agent picker and on shared links."
              value={workspaceName}
              onValueChange={setWorkspaceName}
              placeholder="My team"
              width="lg"
              commitOnBlur
            />
            <SettingsProTextarea
              label="Welcome message"
              description="Optional intro shown to teammates joining a shared agent. Includes voice input + copy."
              value={welcomeMessage}
              onValueChange={setWelcomeMessage}
              placeholder="Use clear, direct prompts. Avoid jargon unless we've defined it."
            />
            <SettingsTailwindColor
              label="Accent color"
              description="Tints chips, focus rings, and active highlights."
              value={accentColor}
              onValueChange={setAccentColor}
              last
            />
          </SettingsSection>
        )}

        {visibleGroups.has("integrations") && (
          <SettingsSection title="Integrations" icon={FolderKanban}>
            <SettingsMultiSelect
              label="Enabled registries"
              description="External catalogs that contribute connectors and skills."
              value={enabledRegistries}
              onValueChange={setEnabledRegistries}
              options={REGISTRY_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
                icon: o.icon,
              }))}
              placeholder="Select registries…"
            />
            <SettingsKeybinding
              label="Quick toggle shortcut"
              description="Open Agent Connections from anywhere in the app."
              value={quickToggleShortcut as KeybindingValue | null}
              onValueChange={(v) =>
                setQuickToggleShortcut(v as AgentConnectionsShortcut | null)
              }
              last
            />
          </SettingsSection>
        )}
      </div>

      <SectionFooter
        description="Preferences are personal to you and synced to every workspace. Workspace-wide defaults live in the team settings."
        learnMoreLabel="Learn more about preferences"
        learnMoreHref="#"
      />
    </div>
  );
}

export default PreferencesSection;
