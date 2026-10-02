"use client";
// features/voice-agent/components/playground/VoicePicker.tsx
//
// Picker for one of xAI's five voices. Reads + writes through Redux.

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { VOICES } from "../../constants";
import { updateConfig } from "../../state/voiceAgentSlice";
import { selectVoiceVoiceId } from "../../state/selectors";
import type { VoiceId } from "../../types";

interface VoicePickerProps {
  instanceId: string;
  disabled?: boolean;
}

export function VoicePicker({ instanceId, disabled }: VoicePickerProps) {
  const dispatch = useAppDispatch();
  const voiceId = useAppSelector((s) => selectVoiceVoiceId(s, instanceId));

  return (
    <div className="space-y-2">
      <Label htmlFor="voice-picker" className="text-sm font-medium">
        Voice
      </Label>
      <Select
        value={voiceId}
        onValueChange={(v) =>
          dispatch(updateConfig({ instanceId, voiceId: v as VoiceId }))
        }
        disabled={disabled}
      >
        <SelectTrigger id="voice-picker" className="w-full">
          <SelectValue placeholder="Pick a voice" />
        </SelectTrigger>
        <SelectContent>
          {VOICES.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Changes apply on the next session start.
      </p>
    </div>
  );
}
