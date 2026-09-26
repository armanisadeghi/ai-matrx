"use client";

// features/voice-agent/components/LiveVoiceDoor.tsx
//
// Names the voice a live conversation speaks in, and opens the ONE row that
// governs it. For AI Matrx's own (builtin) voice agents that row is the
// person's "Live conversation voice"; an agent somebody built speaks in its
// builder's voice, so the door says so instead of pretending the person's
// choice applies.

import { SettingDoor } from "@/features/settings/doors/SettingDoor";
import { VOICE_SETTING_DOORS } from "@/features/settings/tabs/voices/voiceSettingDoors";
import { useAppSelector } from "@/lib/redux/hooks";
import { voiceDisplayName } from "@/lib/voices/voiceSets";

export function LiveVoiceDoor({
  voiceId,
  agentId,
}: {
  voiceId: string | null | undefined;
  agentId?: string | null;
}) {
  const agentType = useAppSelector((s) =>
    agentId ? (s.agentDefinition.agents?.[agentId]?.agentType ?? null) : null,
  );
  // The voice is known only once the agent has loaded — before that (or if it
  // failed to load) the door names no voice rather than guess the fallback.
  const known = Boolean(agentId) && agentType !== null;
  const name = voiceDisplayName("xai", voiceId ?? "");
  if (!known) {
    return (
      <SettingDoor
        target={VOICE_SETTING_DOORS.liveConversation}
        label="Voice settings"
        variant="ghost"
      />
    );
  }
  if (agentType !== "builtin") {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="This agent's builder chose its voice."
      >
        Voice: {name}
      </span>
    );
  }
  return (
    <SettingDoor
      target={VOICE_SETTING_DOORS.liveConversation}
      label={`Voice: ${name}`}
      variant="ghost"
    />
  );
}
