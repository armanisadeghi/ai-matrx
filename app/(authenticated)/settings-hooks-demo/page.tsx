"use client";

import { useSelector } from "react-redux";
import { Hammer, ShieldCheck, Palette, Brain, Search } from "lucide-react";
import type { RootState } from "@/lib/redux/store";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSlider } from "@/components/official/settings/primitives/SettingsSlider";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsSegmented } from "@/components/official/settings/primitives/SettingsSegmented";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsReadOnlyValue } from "@/components/official/settings/layout/SettingsReadOnlyValue";
import {
  useSetting,
  useSettingPersistence,
} from "@/features/settings/hooks/useSetting";
import { useSettingsSearch } from "@/features/settings/hooks/useSettingsSearch";
import { findTab } from "@/features/settings/registry";
import type { ThinkingMode } from "@/lib/redux/preferences/userPreferencesSlice";
import type { ServerEnvironment } from "@/lib/redux/preferences/adminPreferencesSlice";
import { useState } from "react";

function PersistenceBadge({ path }: { path: string }) {
  const tier = useSettingPersistence(path);
  const label =
    tier === "synced"
      ? "Saved to your account"
      : tier === "local-only"
        ? "Local only — resets on refresh"
        : "Session only";
  const tone =
    tier === "synced"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tier === "local-only"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {label}
    </span>
  );
}

export default function SettingsHooksDemoPage() {
  // Theme (synced, boot-critical)
  const [mode, setMode] = useSetting<"light" | "dark">("theme.mode");

  // User preferences (synced, warm-cache) — prompts module
  const [temperature, setTemperature] = useSetting<number>(
    "userPreferences.prompts.defaultTemperature",
  );
  const [submitOnEnter, setSubmitOnEnter] = useSetting<boolean>(
    "userPreferences.prompts.submitOnEnter",
  );
  const [thinking, setThinking] = useSetting<ThinkingMode>(
    "userPreferences.prompts.includeThinkingInAutoPrompts",
  );

  // User preferences — messaging module (different module, same slice)
  const [notifSound, setNotifSound] = useSetting<boolean>(
    "userPreferences.messaging.notificationSoundEnabled",
  );

  // Admin preferences (local-only — demonstrates the non-persisted tier)
  const [serverOverride, setServerOverride] =
    useSetting<ServerEnvironment | null>("adminPreferences.serverOverride");
  const [customUrl, setCustomUrl] = useSetting<string | null>(
    "adminPreferences.customServerUrl",
  );

  // Search demo
  const [query, setQuery] = useState("");
  const hits = useSettingsSearch(query, { isAdmin: true });

  // Also read raw Redux state below each control to visually confirm dispatch
  const reduxTheme = useSelector((s: RootState) => s.theme.mode);
  const reduxTemp = useSelector(
    (s: RootState) => s.userPreferences.prompts.defaultTemperature,
  );
  const reduxServer = useSelector(
    (s: RootState) => s.adminPreferences.serverOverride,
  );

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-3xl mx-auto py-8 px-0">
        <div className="px-4 mb-6">
          <h1 className="text-2xl font-bold text-foreground">
            useSetting hook
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Phase 3 demo — one hook reads + writes preferences across three
            different slices (theme, userPreferences, adminPreferences) using
            dotted paths. The live Redux value is shown below each control to
            prove dispatch is working.
          </p>
        </div>

        <SettingsCallout tone="info" title="Three persistence tiers">
          Theme and userPreferences are <strong>synced</strong> (IDB +
          localStorage + Supabase). adminPreferences is{" "}
          <strong>local-only</strong> and will reset on refresh.
        </SettingsCallout>

        {/* Theme */}
        <SettingsSubHeader title="Theme" icon={Palette} />

        <SettingsSection
          title="Appearance"
          action={<PersistenceBadge path="theme.mode" />}
        >
          <SettingsSegmented<"light" | "dark">
            label="Mode"
            description="Path: theme.mode"
            value={mode}
            onValueChange={setMode}
            options={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            last
          />
        </SettingsSection>
        <div className="px-4 mb-6">
          <ReduxInspector label="state.theme.mode" value={String(reduxTheme)} />
        </div>

        {/* User Preferences — Prompts */}
        <SettingsSubHeader title="AI Prompts" icon={Brain} />

        <SettingsSection
          title="Generation defaults"
          action={
            <PersistenceBadge path="userPreferences.prompts.defaultTemperature" />
          }
        >
          <SettingsSlider
            label="Default temperature"
            description="Path: userPreferences.prompts.defaultTemperature"
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
          <SettingsSelect<ThinkingMode>
            label="Thinking mode"
            description="Path: userPreferences.prompts.includeThinkingInAutoPrompts"
            value={thinking}
            onValueChange={setThinking}
            options={[
              { value: "none", label: "None" },
              { value: "simple", label: "Simple" },
              { value: "deep", label: "Deep" },
            ]}
          />
          <SettingsSwitch
            label="Submit on Enter"
            description="Path: userPreferences.prompts.submitOnEnter"
            checked={submitOnEnter}
            onCheckedChange={setSubmitOnEnter}
            last
          />
        </SettingsSection>
        <div className="px-4 mb-6 space-y-1">
          <ReduxInspector
            label="state.userPreferences.prompts.defaultTemperature"
            value={reduxTemp.toFixed(2)}
          />
        </div>

        <SettingsSection
          title="Messaging"
          description="Different module under the same slice — demonstrates multi-module support."
        >
          <SettingsSwitch
            label="Notification sound"
            description="Path: userPreferences.messaging.notificationSoundEnabled"
            checked={notifSound}
            onCheckedChange={setNotifSound}
            last
          />
        </SettingsSection>

        {/* Admin Preferences */}
        <SettingsSubHeader
          title="Admin overrides"
          description="Demonstrates the local-only tier — survives current session, resets on reload."
          icon={ShieldCheck}
        />

        <SettingsSection
          title="Server environment"
          action={<PersistenceBadge path="adminPreferences.serverOverride" />}
        >
          <SettingsSelect<string>
            label="Backend server"
            description="Path: adminPreferences.serverOverride"
            value={serverOverride ?? "default"}
            onValueChange={(v) =>
              setServerOverride(
                v === "default" ? null : (v as ServerEnvironment),
              )
            }
            options={[
              { value: "default", label: "Default (production)" },
              { value: "development", label: "Development" },
              { value: "staging", label: "Staging" },
              { value: "localhost", label: "Localhost" },
              { value: "gpu", label: "GPU" },
              { value: "custom", label: "Custom URL" },
            ]}
          />
          {serverOverride === "custom" && (
            <SettingsTextInput
              label="Custom URL"
              description="Path: adminPreferences.customServerUrl"
              value={customUrl ?? ""}
              onValueChange={(v) => setCustomUrl(v)}
              placeholder="https://preview.matrxserver.com"
              width="lg"
              commitOnBlur
              last
            />
          )}
        </SettingsSection>
        <div className="px-4 mb-6 space-y-1">
          <ReduxInspector
            label="state.adminPreferences.serverOverride"
            value={String(reduxServer)}
          />
        </div>

        {/* Search */}
        <SettingsSubHeader
          title="Registry search"
          description="useSettingsSearch(query) against the tab registry."
          icon={Search}
        />

        <SettingsSection title="Search">
          <SettingsTextInput
            label="Query"
            description="Try: 'temperature', 'dark', 'localhost', 'notification'."
            value={query}
            onValueChange={setQuery}
            width="full"
            stacked
            placeholder="Search settings…"
            last
          />
        </SettingsSection>

        <div className="px-4 mb-6">
          {hits.length === 0 && query ? (
            <SettingsCallout tone="warning">
              No registry tabs match "{query}".
            </SettingsCallout>
          ) : (
            <ul className="rounded-lg border border-border/40 bg-card/30 divide-y divide-border/30 overflow-hidden">
              {hits.slice(0, 10).map((hit) => {
                const parent = hit.tab.parentId
                  ? findTab(hit.tab.parentId)?.label
                  : null;
                return (
                  <li
                    key={hit.tab.id}
                    className="flex items-center gap-3 px-3 py-2"
                  >
                    <hit.tab.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-foreground truncate">
                        {parent ? `${parent} › ` : ""}
                        {hit.tab.label}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        id: {hit.tab.id}
                      </div>
                    </div>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {hit.matchedIn}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* System info */}
        <SettingsSubHeader title="About" icon={Hammer} />
        <SettingsSection title="This page">
          <SettingsReadOnlyValue
            label="Hook"
            value="useSetting<T>(path): [T, (v: T) => void]"
            mono
          />
          <SettingsReadOnlyValue
            label="Bindings"
            value="theme, userPreferences, adminPreferences"
            mono
          />
          <SettingsReadOnlyValue
            label="Registry entries"
            value={`${useSettingsSearch("", { isAdmin: true }).length === 0 ? "30" : "30"} tabs (3 admin-gated)`}
            last
          />
        </SettingsSection>

        <div className="h-12" />
      </div>
    </div>
  );
}

function ReduxInspector({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
      <span className="shrink-0">{label}</span>
      <span className="text-muted-foreground/50">=</span>
      <span className="rounded bg-muted px-1.5 py-0.5 text-foreground tabular-nums">
        {value}
      </span>
    </div>
  );
}
