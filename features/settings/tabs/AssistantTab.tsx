"use client";

import { PenLine, SquareStack, User } from "lucide-react";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsTextInput } from "@/components/official/settings/primitives/SettingsTextInput";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { settingDoorHref } from "@/features/settings/doors/settingDoorTarget";
import { CHAT_DEFAULT_MODEL_KNOB } from "@/features/ai-models/preferredChatModel";
import { useSetting } from "../hooks/useSetting";

export default function AssistantTab() {
  // Settings truth sweep (2026-09-26): Always active, Always watching, Use
  // audio, Personal mode and Memory level were removed from this screen —
  // nothing in any app read them, so each switch promised a behavior that
  // never happened. Their stored values are left untouched.
  const [name, setName] = useSetting<string>("userPreferences.assistant.name");
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

      <SettingsSection title="Identity" icon={User}>
        <SettingsTextInput
          label="Assistant name"
          description="What the assistant calls itself."
          value={name}
          onValueChange={setName}
          placeholder="e.g., Assistant, Jarvis"
          commitOnBlur
          stacked
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
