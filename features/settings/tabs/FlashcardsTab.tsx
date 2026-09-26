"use client";

import { BookOpen } from "lucide-react";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsLink } from "@/components/official/settings/primitives/SettingsLink";
import { settingDoorHref } from "../doors/settingDoorTarget";
import { VOICE_SETTING_DOORS } from "./voices/voiceSettingDoors";

/**
 * Flashcards settings — this screen used to also offer education level,
 * study mode, language, tutor persona, font size, card difficulty, AI tutor
 * difficulty and target score, each saving to `userPreferences.flashcard.*`.
 * The settings-truth-audit (2026-09-25) traced every one of those keys and
 * found no reader anywhere in this repo, `aidream`, or any client: the
 * flashcard study/session UI (`features/flashcards`) has no education-level,
 * study-mode, persona, difficulty, or target-score concept at all — they
 * were dead controls saving values nothing ever applied. Removed rather
 * than left as a screen that looked configurable but did nothing; the
 * stored preference rows are untouched (no data was deleted). See the
 * settings-truth-sweep lane report for the full census:
 * common-docs/projects/settings-truth-sweep/lanes/voice-comm-learning.md.
 */
export default function FlashcardsTab() {
  return (
    <>
      <SettingsSubHeader
        title="Flashcards"
        description="Your tutor's voice."
        icon={BookOpen}
      />
      <SettingsSection title="Tutor">
        <SettingsLink
          label="Tutor voice"
          description="The voice tutor is one of AI Matrx's live assistants, so it speaks in your live conversation voice (Eve unless you pick one)."
          href={settingDoorHref(VOICE_SETTING_DOORS.liveConversation)}
          actionLabel="Voices"
          last
        />
      </SettingsSection>
    </>
  );
}
