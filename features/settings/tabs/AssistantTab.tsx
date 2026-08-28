"use client";

import { SquareStack, User } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSlider } from "@/components/official/settings/primitives/SettingsSlider";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsModelPicker } from "@/components/official/settings/primitives/SettingsModelPicker";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { useSetting } from "../hooks/useSetting";
import type { AIProvider } from "@/lib/ai/aiChat.types";

const providerOptions: { value: AIProvider; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "groq", label: "Groq" },
  { value: "cohere", label: "Cohere" },
  { value: "matrx", label: "Matrx" },
  { value: "other", label: "Other" },
];

export default function AssistantTab() {
  const [alwaysActive, setAlwaysActive] = useSetting<boolean>(
    "userPreferences.assistant.alwaysActive",
  );
  const [alwaysWatching, setAlwaysWatching] = useSetting<boolean>(
    "userPreferences.assistant.alwaysWatching",
  );
  const [useAudio, setUseAudio] = useSetting<boolean>(
    "userPreferences.assistant.useAudio",
  );
  const [isPersonal, setIsPersonal] = useSetting<boolean>(
    "userPreferences.assistant.isPersonal",
  );
  const [name, setName] = useSetting<string>("userPreferences.assistant.name");
  const [memoryLevel, setMemoryLevel] = useSetting<number>(
    "userPreferences.assistant.memoryLevel",
  );
  const [provider, setProvider] = useSetting<AIProvider>(
    "userPreferences.assistant.preferredProvider",
  );
  const [model, setModel] = useSetting<string>(
    "userPreferences.assistant.preferredModel",
  );

  return (
    <>
      <SettingsSubHeader
        title="Assistant"
        description="How your AI assistant should behave."
        icon={SquareStack}
      />

      <SettingsSection title="Activation">
        <SettingsSwitch
          label="Always active"
          description="Keep the assistant running even when no conversation is open."
          checked={alwaysActive}
          onCheckedChange={setAlwaysActive}
        />
        <SettingsSwitch
          label="Always watching"
          description="Observe screen context even when not explicitly invoked."
          warning="May consume extra resources."
          checked={alwaysWatching}
          onCheckedChange={setAlwaysWatching}
        />
        <SettingsSwitch
          label="Use audio"
          description="Respond with spoken audio in addition to text."
          checked={useAudio}
          onCheckedChange={setUseAudio}
          last
        />
      </SettingsSection>

      <SettingsSection title="Identity" icon={User}>
        <SettingsTextInput
          label="Assistant name"
          description="What the assistant calls itself."
          value={name}
          onValueChange={setName}
          placeholder="e.g., Assistant, Jarvis"
          commitOnBlur
          stacked
        />
        <SettingsSwitch
          label="Personal mode"
          description="Use a more casual, personalized tone."
          checked={isPersonal}
          onCheckedChange={setIsPersonal}
          last
        />
      </SettingsSection>

      <SettingsSection title="Memory">
        <SettingsSlider
          label="Memory level"
          description="How much conversation history the assistant retains between sessions."
          value={memoryLevel}
          onValueChange={setMemoryLevel}
          min={0}
          max={10}
          step={1}
          minLabel="Minimal"
          midLabel="Moderate"
          maxLabel="Maximum"
          last
        />
      </SettingsSection>

      <SettingsSection title="Model">
        <SettingsSelect<AIProvider>
          label="Provider"
          value={provider}
          onValueChange={setProvider}
          options={providerOptions}
        />
        <SettingsModelPicker
          label="Preferred model"
          description="Used by the assistant when a surface does not choose a model."
          value={model && model !== "default" ? model : null}
          onValueChange={(modelId) => setModel(modelId ?? "default")}
          scope="all"
          allowPlatformDefault
          defaultModality="text"
          last
        />
      </SettingsSection>
    </>
  );
}
