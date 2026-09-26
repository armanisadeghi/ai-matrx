"use client";

import { PenLine, SquareStack, User } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsSlider } from "@/components/official/settings/primitives/SettingsSlider";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { settingDoorHref } from "@/features/settings/doors/settingDoorTarget";
import { CHAT_DEFAULT_MODEL_KNOB } from "@/features/ai-models/preferredChatModel";
import { useSetting } from "../hooks/useSetting";

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
  const [restoreUnsentDrafts, setRestoreUnsentDrafts] = useSetting<boolean>(
    "userPreferences.prompts.restoreUnsentDrafts",
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

      <SettingsSection title="Composing" icon={PenLine}>
        <SettingsSwitch
          label="Put unsent drafts back"
          description="If you reload or crash while writing a message, we keep what you typed in that tab and put it back in the box, per conversation. A sent message is never put back."
          checked={restoreUnsentDrafts !== false}
          onCheckedChange={setRestoreUnsentDrafts}
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
        {/* The model that answers when a surface doesn't choose one is ONE
            setting, `agents.model_prefs.chat_default_model` (organization →
            user → device), shown on the Settings first screen. The
            `assistant.preferredProvider` / `assistant.preferredModel` fields
            that used to render here were a second source of truth nothing
            read — this row is a door to the real one. */}
        <SettingsLink
          label="Default AI model"
          description="Chat, quick questions and everyday drafting answer with this model unless you pick another. Your organization can set one for everyone; yours wins for you."
          href={settingDoorHref({
            scope: "user",
            tabId: "firstScreen",
            controlId: CHAT_DEFAULT_MODEL_KNOB,
          })}
          actionLabel="Change"
          last
        />
      </SettingsSection>
    </>
  );
}
