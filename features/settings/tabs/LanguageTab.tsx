"use client";

import { Globe } from "lucide-react";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { useSetting, useSettingReset } from "../hooks/useSetting";
import { LANGUAGE_OPTIONS } from "../agent-writable-settings";
import { readDeviceTimeZone, isValidTimeZone } from "@/lib/time/personTimeZone";
import { useMemo } from "react";
import { PreferencesLoadGate } from "@/components/read-state/PreferencesLoadGate";

/**
 * Language defaults. Right now there's no single "app language" slice — each
 * feature maintains its own `language` preference. This tab surfaces every
 * language field so users don't have to hunt across tabs.
 */
export default function LanguageTab() {
  const [voiceLang, setVoiceLang] = useSetting<string>(
    "userPreferences.voice.language",
  );
  const [textLang, setTextLang] = useSetting<string>(
    "userPreferences.textGeneration.language",
  );
  const voiceReset = useSettingReset<string>("userPreferences.voice.language");
  const textReset = useSettingReset<string>("userPreferences.textGeneration.language");

  const [zone, setZone] = useSetting<string>("userPreferences.display.timeZone");
  const [follows, setFollows] = useSetting<boolean>(
    "userPreferences.display.timeZoneFollowsDevice",
  );
  const zoneOptions = useMemo(() => {
    let names: string[] = [];
    try {
      names = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] })
        .supportedValuesOf?.("timeZone") ?? [];
    } catch {
      names = [];
    }
    if (isValidTimeZone(zone) && !names.includes(zone)) names = [zone, ...names];
    return names.map((n) => ({ value: n, label: n.replace(/_/g, " ") }));
  }, [zone]);

  return (
    <>
      <SettingsSubHeader
        title="Language & Region"
        description="Each feature keeps its own language; there is no single app language."
        icon={Globe}
      />

      <PreferencesLoadGate what="your time zone">
        <SettingsSection title="Time zone">
          <SettingsSwitch
            label="Use my device's time zone"
            checked={follows !== false}
            onCheckedChange={(on) => {
              setFollows(on);
              if (on) {
                const device = readDeviceTimeZone();
                if (device) setZone(device);
              }
            }}
          />
          <SettingsSelect
            label="Time zone"
            description="Where today starts for you."
            value={zone || readDeviceTimeZone() || "UTC"}
            onValueChange={(next) => {
              setFollows(false);
              setZone(next);
            }}
            options={zoneOptions}
            last
          />
        </SettingsSection>
      </PreferencesLoadGate>

      <PreferencesLoadGate what="your language defaults">
        <SettingsSection title="Language defaults">
          <SettingsSelect
            label="Voice input"
            description="Speech-to-text recognition language."
            value={voiceLang}
            onValueChange={setVoiceLang}
            options={LANGUAGE_OPTIONS}
            modified={voiceReset.modified}
            onReset={voiceReset.reset}
            resetLabel="Reset voice input language to its default"
          />
          <SettingsSelect
            label="Text generation"
            description="Default language for generated text."
            value={textLang}
            onValueChange={setTextLang}
            options={LANGUAGE_OPTIONS}
            modified={textReset.modified}
            onReset={textReset.reset}
            resetLabel="Reset text generation language to its default"
            last
          />
        </SettingsSection>
      </PreferencesLoadGate>
    </>
  );
}
