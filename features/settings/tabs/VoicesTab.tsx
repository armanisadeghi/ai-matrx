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
import { LANGUAGE_OPTIONS } from "../agent-writable-settings";
import { useUniversalSettings } from "../universal/UniversalSettingsContext";
import { UniversalSettingsRows } from "../universal/UniversalSettingsPane";
import { VoiceLibrary } from "./voices/VoiceLibrary";
import {
  LIVE_CONVERSATION_VOICE_KEY,
  READ_ALOUD_VOICE_KEY,
} from "./voices/voiceSettingDoors";

export default function VoicesTab() {
  const settings = useUniversalSettings();
  const { speed, language, update } = useListeningSettings();
  const [dragSpeed, setDragSpeed] = useState<number | null>(null);

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
  const noOrganizationYet =
    !settings.isLoading && !settings.error && !settings.organizationId;

  return (
    <>
      <SettingsSubHeader
        title="Voices"
        description="Every voice AI Matrx speaks with. AI Matrx uses a few different speech engines, and each has its own voices — so you choose one voice per kind of listening."
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
        title="Read-aloud speed and language"
        description="How your read-aloud voice speaks."
      >
        <SettingsSlider
          label="Read-aloud speed"
          description="1.0 is the voice's natural pace. Our default is 1.2."
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
          midLabel="Default"
          maxLabel="Faster"
        />
        <SettingsSelect
          label="Read-aloud language"
          value={language}
          onValueChange={(v) => void update({ language: v })}
          options={LANGUAGE_OPTIONS}
          last
        />
      </SettingsSection>

      <SettingsSection
        title="Gemini live conversation"
        description="The Gemini voice page (Voice → Gemini)."
      >
        <SettingsRow
          label="Gemini live voice"
          description="Google's default Gemini voice speaks here. AI Matrx does not choose or change it yet, so there is one voice and no choice."
          anchorId="voice-gemini-live"
          labelFor={null}
          last
        >
          <span className="text-sm text-muted-foreground">Google default</span>
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Voices for what you build"
        description="These voices speak to other people — your podcast listeners, the people who use your agents. You choose them where you build the thing, not here."
      >
        <SettingsLink
          label="Podcast hosts"
          description="Each episode casts its hosts from the voice library below — Google voices for one or two hosts, ElevenLabs voices for three or more."
          href="/podcast"
          actionLabel="Podcast studio"
        />
        <SettingsLink
          label="Speakers in an agent's speech script"
          description="Each speaker gets a voice from the library below, picked in the agent builder's speech script editor."
          href="/agents"
          actionLabel="Agents"
        />
        <SettingsLink
          label="Live voice agents you build"
          description="Your voice agent speaks in one of the five live voices (Ara, Eve, Leo, Rex, Sal), set in the voice playground and saved on the agent."
          href="/chat/voice/playground"
          actionLabel="Voice playground"
        />
        <SettingsRow
          label="Text-to-speech steps in workflows"
          description="Each step names its own voice from the library. A step with no voice speaks in its model's default voice."
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
        description="Voices that are fixed today, listed so nothing is hidden."
      >
        <SettingsRow
          label="Phone line notices"
          description="People who call an AI Matrx phone line hear the consent and disclosure notices in Amazon Polly's Joanna voice. It cannot be changed yet."
          anchorId="voice-phone-notices"
          labelFor={null}
        >
          <span className="text-sm text-muted-foreground">Joanna</span>
        </SettingsRow>
        <SettingsRow
          label="Chats you share publicly"
          description="Someone who opens a chat you shared, without signing in, hears their own browser's built-in voice."
          anchorId="voice-public-chat"
          labelFor={null}
        >
          <span className="text-sm text-muted-foreground">Their browser</span>
        </SettingsRow>
        <SettingsRow
          label="Chrome extension"
          description="The extension reads replies aloud with the same engine as read-aloud here, and follows your read-aloud voice."
          anchorId="voice-chrome-extension"
          labelFor={null}
        >
          <span className="text-sm text-muted-foreground">Follows read-aloud</span>
        </SettingsRow>
        <SettingsRow
          label="Desktop app (Matrx Local)"
          description="The desktop app speaks offline with its own voices, which the web voices cannot run on. Choose them in the desktop app's Text-to-Speech settings."
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
