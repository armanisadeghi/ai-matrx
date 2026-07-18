"use client";

import type { Resource } from "@/features/agents/resources/types";
import { VoicePadEmbed } from "@/components/official-candidate/voice-pad/components/VoicePadEmbed";
import {
  RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";

interface AudioResourcePickerProps {
  conversationId: string;
  onBack: () => void;
  onSelect: (resource: Resource) => void;
}

/** Isolated voicePad slice key per conversation attach-menu session. */
function attachMenuVoicePadInstanceId(conversationId: string) {
  return `attach-menu-${conversationId}`;
}

export function AudioResourcePicker({
  conversationId,
  onBack,
  onSelect,
}: AudioResourcePickerProps) {
  return (
    <div
      className={`flex ${RESOURCE_PICKER_RUN_CONTROL_HEIGHT_CLASS} flex-col`}
    >
      <ResourcePickerSubViewHeader title="Voice Pad" onBack={onBack} />
      <VoicePadEmbed
        instanceId={attachMenuVoicePadInstanceId(conversationId)}
        className="min-h-0 flex-1"
        onAttachTranscript={(transcript) => {
          onSelect({
            type: "audio",
            data: {
              filename: "Voice Pad",
              transcript,
            },
          });
        }}
      />
    </div>
  );
}
