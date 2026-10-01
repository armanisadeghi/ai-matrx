"use client";

// features/settings/tabs/VoicesTab.tsx
//
// THE ONE PLACE every voice AI Matrx speaks with is listed, heard and — where
// a choice exists — chosen. Facts behind it: the 2026-09-25 voice census
// (common-docs/operations/for-arman/2026-09-25/voice-census.md).
//
// Three honest groups, never blended:
//   1. Voices that speak to YOU (you as a listener) — one row per engine,
//      because the engines' voices are not interchangeable:
//        read-aloud          → media.listening.voice   (Cartesia)
//        live conversation   → media.conversation.voice (xAI Realtime)
//        Gemini live         → Google's default; no choice exists yet
//   2. Voices for what you BUILD (they speak to other people) — each chosen
//      where the thing is built; the library below lets you hear all of them.
//   3. Fixed voices elsewhere — listed so nothing is hidden.
//        phone line notices  → Amazon Polly Joanna (not changeable yet)
//
// Every place that speaks links back here through a SettingDoor to its row
// (VOICE_SETTING_DOORS below).

import { AudioLines } from "lucide-react";
import { useState } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSlider } from "@/components/official/settings/primitives/SettingsSlider";
import { SettingsRow } from "@/components/official/settings/SettingsRow";
import { useListeningSettings } from "@/features/audio/service/useListeningSettings";
import { TTS_DEFAULT_SPEED } from "@/lib/cartesia/config";
import type { ScopedKnob } from "@/lib/scoped-config/types";
import {
  LANGUAGE_OPTIONS,
  VOICE_EMOTION_OPTIONS,
  type VoiceEmotion,
} from "../agent-writable-settings";
import { useSetting } from "../hooks/useSetting";
import { useUniversalSettings } from "../universal/UniversalSettingsContext";
import { UniversalSettingsRows } from "../universal/UniversalSettingsPane";
import { VoiceLibrary } from "./voices/VoiceLibrary";
import {
  LIVE_CONVERSATION_VOICE_KEY,
  READ_ALOUD_VOICE_KEY,
} from "./voices/voiceSettingDoors";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { PreferencesLoadGate } from "@/components/read-state/PreferencesLoadGate";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";

export default function VoicesTab() {
  const settings = useUniversalSettings();
  const { speed, language, update } = useListeningSettings();
  const [dragSpeed, setDragSpeed] = useState<number | null>(null);
  const [emotion, setEmotion] = useSetting<VoiceEmotion>(
    "userPreferences.voice.emotion",
  );

  const knobs = [READ_ALOUD_VOICE_KEY, LIVE_CONVERSATION_VOICE_KEY]
    .map((key) => settings.knobByKey(key))
    .filter((knob): knob is ScopedKnob => Boolean(knob));
  const registerConsulted =
    !settings.isLoading && !settings.error && Boolean(settings.organizationId);
  const missing = registerConsulted
    ? [READ_ALOUD_VOICE_KEY, LIVE_CONVERSATION_VOICE_KEY].filter(
        (key) => !settings.knobByKey(key),
      )
    : [];
  // "No organization yet" is said only once boot has ANSWERED with none — never
  // while it is still resolving, and never for a failed read (that is not "pick one").
  const { organizationState } = useOrganizationRequired();
  const noOrganizationYet =
    !settings.isLoading && !settings.error && !settings.organizationId && organizationState === "required";

  return (
    <>
      <SettingsSubHeader
        title="Voices"
        description="Every voice AI Matrx speaks with, one per kind of listening"
        icon={AudioLines}
      />

      {settings.isLoading && (
        <div className="flex items-center justify-center py-8">
          <SuspenseLoader size="sm" message="Reading your voice choices…" />
        </div>
      )}
      {settings.error && (
        <SettingsCallout tone="error" title="Your voice choices could not be read">
          {settings.error}
          <ErrorAlchemyMenu error={settings.error} />
        </SettingsCallout>
      )}
      {noOrganizationYet && (
        <SettingsCallout tone="info" title="Choose an organization to see your voice choices">
          Your voice choices sit on your organization&apos;s settings ladder. Pick
          an organization from the header and they appear here.
        </SettingsCallout>
      )}
      {missing.length > 0 && (
        <SettingsCallout tone="error" title="A voice setting is missing from the register">
          These voice settings are not registered yet, so they cannot be shown:{" "}
          {missing.join(", ")}.
        </SettingsCallout>
      )}

      {knobs.length > 0 && <UniversalSettingsRows knobs={knobs} hideKey />}

      <SettingsSection
        title="How your read-aloud voice speaks"
        description="Speed, language and emotion for read-aloud."
      >
        <SettingsSlider
          label="Read-aloud speed"
          description="1.0 is natural pace; our default is 1.2."
          value={dragSpeed ?? (speed || TTS_DEFAULT_SPEED)}
          onValueChange={setDragSpeed}
          onValueCommit={(v) => {
            setDragSpeed(null);
            void update({ speed: v });
          }}
          min={0.6}
          max={1.5}
          step={0.05}
          precision={2}
          minLabel="Slower"
          maxLabel="Faster"
        />
        <SettingsSelect
          label="Read-aloud language"
          value={language}
          onValueChange={(v) => void update({ language: v })}
          options={LANGUAGE_OPTIONS}
        />
        <PreferencesLoadGate what="your read-aloud emotion">
          <SettingsSelect
            label="Read-aloud emotion"
            description="Read-aloud tone; live conversation is not affected."
            value={emotion}
            onValueChange={setEmotion}
            options={VOICE_EMOTION_OPTIONS}
            last
          />
        </PreferencesLoadGate>
      </SettingsSection>

      <SettingsSection
        title="Gemini live conversation"
      >
        <SettingsRow
          label="Gemini live voice"
          anchorId="voice-gemini-live"
          labelFor={null}
          last
        >
          <span className="text-sm text-muted-foreground">Google default</span>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Voices for what you build"
      >
        <SettingsLink
          label="Podcast hosts"
          description="Hosts are cast from the voice library below."
          helpText="Google voices for 1–2 hosts, ElevenLabs for 3 or more."
          href="/podcast"
          actionLabel="Podcast studio"
        />
        <SettingsLink
          label="Speakers in an agent's speech script"
          description="Each speaker's voice is picked in the speech script editor."
          helpText="Voices come from the library below."
          href="/agents"
          actionLabel="Agents"
        />
        <SettingsLink
          label="Live voice agents you build"
          description="One of five live voices, set in the voice playground."
          helpText="Ara, Eve, Leo, Rex or Sal, saved on the agent."
          href="/chat/voice/playground"
          actionLabel="Voice playground"
        />
        <SettingsRow
          label="Text-to-speech steps in workflows"
          description="Each step picks its own voice."
          helpText="A step with no voice speaks in its model's default voice."
          anchorId="voice-builder-workflow-steps"
          labelFor={null}
          last
        >
          <span className="text-sm text-muted-foreground">Set in each step</span>
        </SettingsRow>
      </SettingsSection>

      <VoiceLibrary />

      <SettingsSection
        title="Other places AI Matrx speaks"
      >
        <SettingsRow
          label="Phone line notices"
          description="Consent and disclosure notices callers hear; fixed for now."
          anchorId="voice-phone-notices"
          labelFor={null}
        >
          <span className="text-sm text-muted-foreground">Joanna</span>
        </SettingsRow>
        <SettingsRow
          label="Chats you share publicly"
          description="Signed-out viewers of a chat you shared"
          anchorId="voice-public-chat"
          labelFor={null}
        >
          <span className="text-sm text-muted-foreground">Their browser</span>
        </SettingsRow>
        <SettingsRow
          label="Chrome extension"
          description="Reads replies aloud with the read-aloud engine."
          anchorId="voice-chrome-extension"
          labelFor={null}
        >
          <span className="text-sm text-muted-foreground">Follows read-aloud</span>
        </SettingsRow>
        <SettingsRow
          label="Desktop app (Matrx Local)"
          description="Offline voices, chosen in its Text-to-Speech settings."
          anchorId="voice-desktop-app"
          labelFor={null}
          last
        >
          <span className="text-sm text-muted-foreground">In the desktop app</span>
        </SettingsRow>
      </SettingsSection>
    </>
  );
}
