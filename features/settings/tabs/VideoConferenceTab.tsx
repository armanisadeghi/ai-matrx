"use client";

import { Video } from "lucide-react";
import { SettingsSelect } from "@/components/official/settings/primitives/SettingsSelect";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { useSetting } from "../hooks/useSetting";

export default function VideoConferenceTab() {
  const [background, setBackground] = useSetting<string>(
    "userPreferences.videoConference.background",
  );
  const [filter, setFilter] = useSetting<string>(
    "userPreferences.videoConference.filter",
  );
  const [camera, setCamera] = useSetting<string>(
    "userPreferences.videoConference.defaultCamera",
  );
  const [meetingType, setMeetingType] = useSetting<string>(
    "userPreferences.videoConference.defaultMeetingType",
  );
  const [layout, setLayout] = useSetting<string>(
    "userPreferences.videoConference.defaultLayout",
  );
  const [notesType, setNotesType] = useSetting<string>(
    "userPreferences.videoConference.defaultNotesType",
  );
  const [aiActivity, setAiActivity] = useSetting<string>(
    "userPreferences.videoConference.AiActivityLevel",
  );

  return (
    <>
      <SettingsSubHeader
        title="Video conference"
        description="Defaults for video meetings."
        icon={Video}
      />
      <SettingsSection title="Video">
        <SettingsSelect
          label="Background"
          value={background}
          onValueChange={setBackground}
          options={[
            { value: "default", label: "Default" },
            { value: "blur", label: "Blur" },
            { value: "custom", label: "Custom image" },
            { value: "none", label: "None" },
          ]}
        />
        <SettingsSelect
          label="Video filter"
          value={filter}
          onValueChange={setFilter}
          options={[
            { value: "default", label: "Default" },
            { value: "none", label: "None" },
            { value: "grayscale", label: "Grayscale" },
            { value: "warm", label: "Warm" },
            { value: "cool", label: "Cool" },
            { value: "vivid", label: "Vivid" },
          ]}
          last
        />
      </SettingsSection>
      {/* Mic + speaker live in the canonical audio-device preferences
          (userPreferences.audioDevices — the audio device settings, wired to
          real enumerateDevices ids). Only the camera stays here. */}
      <SettingsSection title="Devices">
        <SettingsSelect
          label="Camera"
          value={camera}
          onValueChange={setCamera}
          options={[
            { value: "default", label: "System default" },
            { value: "front", label: "Front" },
            { value: "rear", label: "Rear" },
            { value: "external", label: "External" },
          ]}
          last
        />
      </SettingsSection>
      <SettingsSection title="Meeting">
        <SettingsSelect
          label="Meeting type"
          value={meetingType}
          onValueChange={setMeetingType}
          options={[
            { value: "default", label: "Default" },
            { value: "video", label: "Video call" },
            { value: "audio", label: "Audio only" },
            { value: "screen-share", label: "Screen share" },
            { value: "webinar", label: "Webinar" },
          ]}
        />
        <SettingsSelect
          label="Layout"
          value={layout}
          onValueChange={setLayout}
          options={[
            { value: "default", label: "Default" },
            { value: "grid", label: "Grid" },
            { value: "speaker", label: "Speaker" },
            { value: "gallery", label: "Gallery" },
            { value: "spotlight", label: "Spotlight" },
          ]}
        />
        <SettingsSelect
          label="Meeting notes"
          value={notesType}
          onValueChange={setNotesType}
          options={[
            { value: "default", label: "Default" },
            { value: "transcript", label: "Transcript" },
            { value: "summary", label: "AI summary" },
            { value: "action-items", label: "Action items" },
            { value: "manual", label: "Manual" },
          ]}
        />
        <SettingsSelect
          label="AI activity"
          value={aiActivity}
          onValueChange={setAiActivity}
          options={[
            { value: "default", label: "Default" },
            { value: "off", label: "Off" },
            { value: "low", label: "Low" },
            { value: "medium", label: "Medium" },
            { value: "high", label: "High" },
          ]}
          last
        />
      </SettingsSection>
    </>
  );
}
