"use client";

import {
  Sliders,
  Bell,
  Shield,
  Building,
  Briefcase,
  FolderKanban,
  ListChecks,
  Globe,
  Github,
  Package,
  Hexagon,
} from "lucide-react";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsCheckbox } from "@/components/official/settings/primitives/SettingsCheckbox";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSegmented } from "@/components/official/settings/primitives/SettingsSegmented";
import { SettingsRadioGroup } from "@/components/official/settings/primitives/SettingsRadioGroup";
import { SettingsSlider } from "@/components/official/settings/primitives/SettingsSlider";
import { SettingsNumberInput } from "@/components/official/settings/primitives/SettingsNumberInput";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsTextarea } from "@/components/official/settings/primitives/SettingsTextarea";
import { SettingsColorPicker } from "@/components/official/settings/primitives/SettingsColorPicker";
import { SettingsMultiSelect } from "@/components/official/settings/primitives/SettingsMultiSelect";
import {
  SettingsKeybinding,
  type KeybindingValue,
} from "@/components/official/settings/primitives/SettingsKeybinding";
import { useSetting } from "@/features/settings/hooks/useSetting";
import type { AgentConnectionsShortcut } from "@/lib/redux/slices/userPreferencesSlice";

const SCOPE_OPTIONS = [
  { value: "user", label: "Personal" },
  { value: "organization", label: "Organization" },
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

export function PreferencesSection() {
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

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto scrollbar-thin pt-3">
      <SettingsSubHeader
        title="Preferences"
        description="Personal preferences for how Agent Connections behaves across your workspaces."
        icon={Sliders}
      />

      <SettingsCallout tone="info" title="Synced to your account">
        Changes here save automatically and follow you across devices.
      </SettingsCallout>

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

      <SettingsSection title="Defaults" icon={Shield}>
        <SettingsSelect
          label="Default scope"
          description="Which scope is selected when you open Agent Connections."
          value={defaultScope}
          onValueChange={setDefaultScope}
          options={SCOPE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
        <SettingsSegmented
          label="Density"
          description="Spacing between rows in list views."
          value={densityMode}
          onValueChange={setDensityMode}
          options={DENSITY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
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
        <SettingsTextarea
          label="Welcome message"
          description="Optional intro shown to teammates joining a shared agent."
          value={welcomeMessage}
          onValueChange={setWelcomeMessage}
          placeholder="Use clear, direct prompts. Avoid jargon unless we've defined it."
          rows={3}
          maxLength={400}
          showCount
          commitOnBlur
        />
        <SettingsColorPicker
          label="Accent color"
          description="Tints chips, focus rings, and active highlights."
          value={accentColor}
          onValueChange={setAccentColor}
          presets={["#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b"]}
          last
        />
      </SettingsSection>

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
      </div>
    </div>
  );
}

export default PreferencesSection;
