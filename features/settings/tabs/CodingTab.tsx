"use client";

import { Code } from "lucide-react";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingDoor } from "@/features/settings/doors/SettingDoor";

/**
 * Settings truth sweep (2026-09-25, lane ai-media-editor): this tab used to
 * offer nine controls — preferred language, editor theme, execution
 * location, AI activity level, git integration, code completion, code
 * analysis, code formatting, voice assistance — none of which any code
 * anywhere read. Saving them said "saved" and changed nothing. Deleted; the
 * stored preference keys are left alone (no user data removed).
 *
 * The editor's real theme already follows the app-wide color mode
 * (`features/code/editor/useMonacoTheme.ts` → `useThemeMode()`), so that one
 * gets a door to its real home instead of a second, ignored copy. The rest
 * (per-file language, git, completion, analysis, formatting, voice dictation)
 * are not built — see Code workspace for the settings that ARE live.
 */
export default function CodingTab() {
  return (
    <>
      <SettingsSubHeader
        title="Coding"
        description="The code editor doesn't have its own preferences yet — see what's already live below."
        icon={Code}
      />
      <SettingsSection title="Editor appearance">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="text-sm text-muted-foreground">
            The code editor's theme follows your app-wide color mode — there
            is no separate editor theme.
          </div>
          <SettingDoor
            target={{
              scope: "user",
              tabId: "appearance.theme",
              controlId: "settings-control-theme-color-mode",
            }}
            label="Open color mode"
          />
        </div>
      </SettingsSection>
      <SettingsCallout tone="info">
        Preferred language, execution location, AI activity level, git
        integration, code completion, analysis, formatting, and voice
        dictation are not available yet as global defaults. Which agents
        appear in the /code chat and how history is grouped are configured
        under Code workspace.
      </SettingsCallout>
    </>
  );
}
