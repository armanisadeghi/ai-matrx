"use client";

import React from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsModelPicker } from "@/components/official/settings/primitives/SettingsModelPicker";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSlider } from "@/components/official/settings/primitives/SettingsSlider";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { useSetting } from "@/features/settings/hooks/useSetting";
import type { ThinkingMode } from "@/lib/redux/preferences/userPreferencesSlice";

interface StandalonePromptsPreferencesProps {
  onSaveSuccess?: () => void;
  onCancel?: () => void;
  showFooter?: boolean;
}

const thinkingOptions: { value: ThinkingMode; label: string }[] = [
  { value: "none", label: "None" },
  { value: "simple", label: "Simple" },
  { value: "deep", label: "Deep" },
];

/**
 * Prompts module preferences using the unified settings bindings (synced like other settings).
 */
const StandalonePromptsPreferences: React.FC<
  StandalonePromptsPreferencesProps
> = ({ onSaveSuccess, onCancel, showFooter = true }) => {
  const [showSettingsOnMainPage, setShowSettingsOnMainPage] =
    useSetting<boolean>("userPreferences.prompts.showSettingsOnMainPage");
  const [defaultModel, setDefaultModel] = useSetting<string>(
    "userPreferences.prompts.defaultModel",
  );
  const [defaultTemperature, setDefaultTemperature] = useSetting<number>(
    "userPreferences.prompts.defaultTemperature",
  );
  const [alwaysIncludeInternalWebSearch, setAlwaysIncludeInternalWebSearch] =
    useSetting<boolean>(
      "userPreferences.prompts.alwaysIncludeInternalWebSearch",
    );
  const [includeThinkingInAutoPrompts, setIncludeThinkingInAutoPrompts] =
    useSetting<ThinkingMode>(
      "userPreferences.prompts.includeThinkingInAutoPrompts",
    );
  const [submitOnEnter, setSubmitOnEnter] = useSetting<boolean>(
    "userPreferences.prompts.submitOnEnter",
  );
  const [autoClearResponsesInEditMode, setAutoClearResponsesInEditMode] =
    useSetting<boolean>("userPreferences.prompts.autoClearResponsesInEditMode");

  return (
    <div className="flex flex-col gap-4 min-h-0">
      <SettingsSubHeader
        title="Prompt defaults"
        description="Defaults for prompt surfaces and the prompt builder. Changes sync to your account like other settings."
        icon={MessageSquare}
      />

      <div className="flex-1 min-h-0 overflow-y-auto pr-1">
        <SettingsSection title="General">
          <SettingsSwitch
            label="Show settings on main page"
            checked={showSettingsOnMainPage}
            onCheckedChange={setShowSettingsOnMainPage}
          />
          <SettingsModelPicker
            label="Default model"
            description="Used when a prompt does not specify a model."
            value={defaultModel}
            onValueChange={setDefaultModel}
            scope="active"
          />
          <SettingsSlider
            label="Default temperature"
            description="0 = deterministic, 2 = very creative."
            value={defaultTemperature}
            onValueChange={setDefaultTemperature}
            min={0}
            max={2}
            step={0.01}
            precision={2}
          />
          <SettingsSwitch
            label="Always include internal web search"
            checked={alwaysIncludeInternalWebSearch}
            onCheckedChange={setAlwaysIncludeInternalWebSearch}
          />
          <SettingsSelect<ThinkingMode>
            label="Thinking in auto prompts"
            value={includeThinkingInAutoPrompts}
            onValueChange={setIncludeThinkingInAutoPrompts}
            options={thinkingOptions}
          />
          <SettingsSwitch
            label="Submit on Enter"
            checked={submitOnEnter}
            onCheckedChange={setSubmitOnEnter}
          />
          <SettingsSwitch
            label="Auto-clear responses in edit mode"
            description="Clear prior assistant output when editing a prompt in place."
            checked={autoClearResponsesInEditMode}
            onCheckedChange={setAutoClearResponsesInEditMode}
            last
          />
        </SettingsSection>
      </div>

      {showFooter ? (
        <div className="flex justify-end gap-2 pt-3 border-t border-border shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onCancel?.()}
          >
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => onSaveSuccess?.()}>
            Done
          </Button>
        </div>
      ) : null}
    </div>
  );
};

export default StandalonePromptsPreferences;
