"use client";

/**
 * NotesTab — the mode a note opens in, the ONE place it is chosen.
 *
 * Arman, 2026-09-27: a click on a mode in a note changes only THAT note's
 * remembered mode — it never rewrites these defaults (that is how Toast UI
 * once became everyone's default). The defaults change here, and nowhere else.
 * A note last edited in Write still reopens in Write; one last typed as text
 * reopens in the text mode below.
 */

import { StickyNote } from "lucide-react";

import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsRadioGroup } from "@/components/official/settings/primitives/SettingsRadioGroup";
import type { SettingsOption } from "@/components/official/settings/types";
import { PreferencesLoadGate } from "@/components/read-state/PreferencesLoadGate";
import {
  DEFAULT_EDITOR_MODE_SETTING,
  DEFAULT_PHONE_EDITOR_MODE_SETTING,
  defaultDesktopMode,
  phoneNoteMode,
  PLATFORM_DEFAULT_PHONE_EDITOR_MODE,
} from "@/features/notes/hooks/usePreferredDefaultEditorMode";

import { useSetting } from "../hooks/useSetting";

type DesktopMode = "split" | "plain" | "write";
type PhoneMode = "plain" | "write";

const DESKTOP_OPTIONS: SettingsOption<DesktopMode>[] = [
  {
    value: "split",
    label: "Split",
    description: "Plain text on the left, the formatted note live on the right.",
  },
  {
    value: "plain",
    label: "Plain",
    description: "Quick, unformatted text — nothing is ever formatted for you.",
  },
  {
    value: "write",
    label: "Write",
    description: "The formatted editor.",
  },
];

const PHONE_OPTIONS: SettingsOption<PhoneMode>[] = [
  {
    value: "plain",
    label: "Plain",
    description: "Quick, unformatted text — nothing is ever formatted for you.",
  },
  {
    value: "write",
    label: "Write",
    description: "The formatted editor.",
  },
];

export default function NotesTab() {
  const [desktopStored, setDesktop] = useSetting<string | undefined>(DEFAULT_EDITOR_MODE_SETTING);
  const [phoneStored, setPhone] = useSetting<string | undefined>(DEFAULT_PHONE_EDITOR_MODE_SETTING);
  const desktop = defaultDesktopMode(desktopStored);
  const desktopValue: DesktopMode = desktop === "plain" || desktop === "write" ? desktop : "split";
  const phoneValue: PhoneMode = phoneNoteMode(phoneStored) ?? PLATFORM_DEFAULT_PHONE_EDITOR_MODE;

  return (
    <>
      <SettingsSubHeader
        title="Notes"
        description="The mode a note opens in. A note you last edited in Write reopens in Write."
        icon={StickyNote}
      />
      <PreferencesLoadGate what="your notes settings">
        <SettingsSection title="On a computer">
          <SettingsRadioGroup<DesktopMode>
            label="Notes open in"
            value={desktopValue}
            onValueChange={setDesktop}
            options={DESKTOP_OPTIONS}
            last
          />
        </SettingsSection>
        <SettingsSection title="On a phone">
          <SettingsRadioGroup<PhoneMode>
            label="Notes open in"
            value={phoneValue}
            onValueChange={setPhone}
            options={PHONE_OPTIONS}
            last
          />
        </SettingsSection>
      </PreferencesLoadGate>
    </>
  );
}
