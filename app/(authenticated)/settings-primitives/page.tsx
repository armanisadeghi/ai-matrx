"use client";

import { useState } from "react";
import {
  Zap,
  Shield,
  ShieldCheck,
  ShieldOff,
  Palette,
  Brain,
  Cpu,
  Globe,
  Code,
  Keyboard,
  Database,
  Settings
} from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSlider } from "@/components/official/settings/primitives/SettingsSlider";
import { SettingsNumberInput } from "@/components/official/settings/primitives/SettingsNumberInput";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsTextarea } from "@/components/official/settings/primitives/SettingsTextarea";
import { SettingsRadioGroup } from "@/components/official/settings/primitives/SettingsRadioGroup";
import { SettingsCheckbox } from "@/components/official/settings/primitives/SettingsCheckbox";
import { SettingsSegmented } from "@/components/official/settings/primitives/SettingsSegmented";
import { SettingsColorPicker } from "@/components/official/settings/primitives/SettingsColorPicker";
import { SettingsMultiSelect } from "@/components/official/settings/primitives/SettingsMultiSelect";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import {
  SettingsKeybinding,
  type KeybindingValue,
} from "@/components/official/settings/primitives/SettingsKeybinding";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsGrid } from "@/components/official/settings/layout/SettingsGrid";
import { SettingsReadOnlyValue } from "@/components/official/settings/layout/SettingsReadOnlyValue";

export default function SettingsPrimitivesDemoPage() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoSave, setAutoSave] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [theme, setTheme] = useState("system");
  const [editor, setEditor] = useState("default");
  const [temperature, setTemperature] = useState(1.0);
  const [fontSize, setFontSize] = useState(14);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [density, setDensity] = useState("default");
  const [visibility, setVisibility] = useState("private");
  const [accentColor, setAccentColor] = useState("#3b82f6");
  const [languages, setLanguages] = useState<string[]>(["en"]);
  const [shortcut, setShortcut] = useState<KeybindingValue | null>({
    key: "KeyK",
    display: "⌘K",
    meta: true,
  });

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-3xl mx-auto py-8 px-0">
        <div className="px-4 mb-6">
          <h1 className="text-2xl font-bold text-foreground">
            Settings Primitives
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Phase 1 demo — every primitive in every state. Desktop + mobile
            layouts. No Redux yet — all state is local.
          </p>
        </div>

        <SettingsCallout tone="info" title="How to use this library">
          Tabs MUST compose these primitives. Never use raw shadcn components
          inside a settings tab. If a visual variation isn't supported, add a
          variant prop — never pass className.
        </SettingsCallout>

        <SettingsSubHeader
          title="General"
          description="Foundational preferences for the app."
          icon={Settings}
        />

        <SettingsSection title="Notifications">
          <SettingsSwitch
            label="Enable desktop notifications"
            description="Show system notifications for new messages and alerts."
            checked={notificationsEnabled}
            onCheckedChange={setNotificationsEnabled}
          />
          <SettingsSwitch
            label="Auto-save drafts"
            description="Periodically save unfinished work."
            badge={{ label: "Beta", variant: "beta" }}
            checked={autoSave}
            onCheckedChange={setAutoSave}
            modified
          />
          <SettingsSwitch
            label="Send anonymous telemetry"
            description="Help us improve by sending anonymous usage data."
            disabled
            checked={false}
            onCheckedChange={() => {}}
            last
          />
        </SettingsSection>

        <SettingsSection title="Appearance" icon={Palette}>
          <SettingsSelect
            label="Theme"
            description="Override the system theme preference."
            value={theme}
            onValueChange={setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
          <SettingsSegmented
            label="Density"
            description="Spacing in list and table views."
            value={density}
            onValueChange={setDensity}
            options={[
              { value: "compact", label: "Compact" },
              { value: "default", label: "Default" },
              { value: "comfortable", label: "Roomy" },
            ]}
          />
          <SettingsColorPicker
            label="Accent color"
            description="Primary highlight color throughout the UI."
            value={accentColor}
            onValueChange={setAccentColor}
            presets={["#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b"]}
            last
          />
        </SettingsSection>

        <SettingsSubHeader
          title="AI & Models"
          description="Configure AI behaviour."
          icon={Brain}
        />

        <SettingsSection title="Generation">
          <SettingsSlider
            label="Default temperature"
            description="Controls randomness in responses."
            value={temperature}
            onValueChange={setTemperature}
            min={0}
            max={2}
            step={0.01}
            precision={2}
            minLabel="0.00 Deterministic"
            midLabel="1.00 Balanced"
            maxLabel="2.00 Creative"
          />
          <SettingsNumberInput
            label="Max output tokens"
            description="Upper bound on response length."
            value={maxTokens}
            onValueChange={setMaxTokens}
            min={1}
            max={32768}
            integer
          />
          <SettingsSlider
            label="Font size"
            description="Editor font size, in pixels."
            value={fontSize}
            onValueChange={setFontSize}
            min={10}
            max={24}
            step={1}
            unit="px"
            last
          />
        </SettingsSection>

        <SettingsSection
          title="Tools"
          description="Enable specific capabilities for new agents."
        >
          <SettingsMultiSelect
            label="Enabled tools"
            description="Agents inherit these tools by default."
            value={languages}
            onValueChange={setLanguages}
            options={[
              { value: "en", label: "English", icon: Globe },
              { value: "es", label: "Spanish", icon: Globe },
              { value: "fr", label: "French", icon: Globe },
              { value: "de", label: "German", icon: Globe },
              { value: "ja", label: "Japanese", icon: Globe },
            ]}
            max={3}
            last
          />
        </SettingsSection>

        <SettingsSubHeader
          title="Profile"
          description="How you appear to others."
        />

        <SettingsSection title="Identity">
          <SettingsTextInput
            label="Display name"
            description="Shown on comments, shared docs, and profile pages."
            value={displayName}
            onValueChange={setDisplayName}
            placeholder="Ada Lovelace"
            width="lg"
          />
          <SettingsTextarea
            label="Bio"
            description="A short biography — markdown supported."
            value={bio}
            onValueChange={setBio}
            placeholder="I build things that think…"
            rows={4}
            maxLength={280}
            showCount
            commitOnBlur
          />
          <SettingsRadioGroup
            label="Profile visibility"
            description="Who can see your profile?"
            value={visibility}
            onValueChange={setVisibility}
            options={[
              {
                value: "private",
                label: "Private",
                description: "Only you can see it.",
                icon: Shield,
              },
              {
                value: "org",
                label: "Organization",
                description: "Visible to your team.",
                icon: ShieldCheck,
              },
              {
                value: "public",
                label: "Public",
                description: "Anyone with the link.",
                icon: ShieldOff,
              },
            ]}
            last
          />
        </SettingsSection>

        <SettingsSubHeader
          title="Keyboard & Editor"
          description="Shortcuts and code editor behaviour."
          icon={Keyboard}
        />

        <SettingsSection title="Shortcuts">
          <SettingsKeybinding
            label="Open command palette"
            description="Recordable. Click and press keys to bind."
            value={shortcut}
            onValueChange={setShortcut}
          />
          <SettingsSelect
            label="Editor preset"
            description="Preconfigured bundles of editor settings."
            value={editor}
            onValueChange={setEditor}
            options={[
              { value: "default", label: "Default" },
              { value: "vscode", label: "VS Code" },
              { value: "vim", label: "Vim" },
              { value: "emacs", label: "Emacs" },
            ]}
            last
          />
        </SettingsSection>

        <SettingsSubHeader
          title="States Showcase"
          description="Every label state — warnings, errors, disabled, badges."
        />

        <SettingsSection title="Permissions">
          <SettingsCheckbox
            label="I accept the terms of service"
            description="Read our terms at /legal/terms."
            checked={acceptTerms}
            onCheckedChange={setAcceptTerms}
          />
          <SettingsSwitch
            label="Experimental: Parallel streaming"
            description="Run multiple models simultaneously."
            badge={{ label: "Experimental", variant: "experimental" }}
            warning="Incurs 2x token cost. May produce inconsistent results."
            checked={false}
            onCheckedChange={() => {}}
          />
          <SettingsSwitch
            label="Deprecated API v1"
            description="Use the v2 API instead."
            badge={{ label: "Deprecated", variant: "deprecated" }}
            error="This toggle will be removed on 2026-06-01."
            disabled
            checked={true}
            onCheckedChange={() => {}}
          />
          <SettingsSwitch
            label="Admin override"
            description="Visible only to organization admins."
            badge={{ label: "Admin", variant: "admin" }}
            icon={Cpu}
            helpText="This setting affects every member of your organization."
            checked={false}
            onCheckedChange={() => {}}
            last
          />
        </SettingsSection>

        <SettingsSubHeader
          title="Actions"
          description="Buttons, links, and informational rows."
        />

        <SettingsSection title="Account">
          <SettingsButton
            label="Reset preferences"
            description="Restore every preference to its default value."
            actionLabel="Reset to defaults"
            kind="outline"
            onClick={() => alert("Would reset…")}
          />
          <SettingsButton
            label="Clear local cache"
            description="Removes cached queries and reloads the app."
            actionLabel="Clear cache"
            kind="default"
            actionIcon={Zap}
            onClick={() => alert("Would clear…")}
          />
          <SettingsButton
            label="Delete account"
            description="Permanent — no undo."
            actionLabel="Delete account"
            kind="destructive"
            onClick={() => alert("Would delete…")}
          />
          <SettingsLink
            label="Open documentation"
            description="Read the user guide in a new tab."
            href="https://docs.example.com"
          />
          <SettingsLink
            label="View billing"
            description="Manage your plan and invoices."
            href="/billing"
            actionLabel="View"
            last
          />
        </SettingsSection>

        <SettingsSection title="System Info">
          <SettingsReadOnlyValue
            label="App version"
            value="0.3.217"
            icon={Zap}
          />
          <SettingsReadOnlyValue
            label="Build ID"
            value="abc123def456789"
            mono
            copyable
          />
          <SettingsReadOnlyValue
            label="Workspace ID"
            value="ws_01HZQR2S9K5VNEXAMPLEX"
            mono
            copyable
            last
          />
        </SettingsSection>

        <SettingsSubHeader
          title="Dense layouts"
          description="SettingsGrid for side-by-side pickers."
        />

        <SettingsGrid columns={2}>
          <div className="rounded-lg border border-border/40 bg-card/30 overflow-hidden">
            <SettingsSelect
              label="Default language"
              value={theme}
              onValueChange={setTheme}
              options={[
                { value: "system", label: "System" },
                { value: "en", label: "English" },
                { value: "es", label: "Spanish" },
              ]}
              width="full"
              stacked
              last
            />
          </div>
          <div className="rounded-lg border border-border/40 bg-card/30 overflow-hidden">
            <SettingsSelect
              label="Default provider"
              value="openai"
              onValueChange={() => {}}
              options={[
                { value: "openai", label: "OpenAI" },
                { value: "anthropic", label: "Anthropic" },
                { value: "google", label: "Google" },
              ]}
              width="full"
              stacked
              last
            />
          </div>
        </SettingsGrid>

        <SettingsSubHeader
          title="Advanced"
          description="Collapsible sections for advanced options."
          icon={Code}
        />

        <SettingsSection
          title="Database overrides"
          icon={Database}
          collapsible
          defaultOpen={false}
          emphasis="subtle"
        >
          <SettingsTextInput
            label="Connection string"
            description="Overrides the default DATABASE_URL."
            value=""
            onValueChange={() => {}}
            placeholder="postgres://…"
            stacked
          />
          <SettingsSwitch
            label="Use SSL"
            checked={true}
            onCheckedChange={() => {}}
            last
          />
        </SettingsSection>

        <SettingsCallout tone="success" title="All primitives rendered">
          If you can see every row above without layout drift — Phase 1 is
          verified.
        </SettingsCallout>

        <div className="h-12" />
      </div>
    </div>
  );
}
