"use client";
// features/voice-agent/components/playground/InstructionsEditor.tsx
//
// Free-form instructions for the playground variant. The intro route locks
// these and never renders this component.
//
// "Reset" restores the instructions of the agent the `voice.intro` mandate
// resolves to — read live from its agent record. It used to reset to a
// hardcoded copy of that prompt, which meant Reset could hand the user a
// persona the real agent no longer had. Until the mandate's agent has loaded
// there is nothing to reset TO, so the button stays disabled rather than
// offering a stale default.

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VOICE_INTRO_MANDATE_KEY } from "../../constants";
import { useMandateAgentInstructions } from "../../agentInstructions";
import { updateConfig } from "../../state/voiceAgentSlice";
import { selectVoiceInstructions } from "../../state/selectors";

interface InstructionsEditorProps {
  instanceId: string;
  disabled?: boolean;
}

export function InstructionsEditor({
  instanceId,
  disabled,
}: InstructionsEditorProps) {
  const dispatch = useAppDispatch();
  const value = useAppSelector((s) => selectVoiceInstructions(s, instanceId));
  const {
    instructions: defaultInstructions,
    loading,
    error,
  } = useMandateAgentInstructions(VOICE_INTRO_MANDATE_KEY);

  const canReset =
    !disabled && !!defaultInstructions && value !== defaultInstructions;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="instructions" className="text-sm font-medium">
          Instructions
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!canReset}
          title={
            error
              ? `Default unavailable — ${error}`
              : loading
                ? "Loading the default agent's instructions…"
                : "Reset to the default voice agent's instructions"
          }
          onClick={() => {
            if (!defaultInstructions) return;
            dispatch(
              updateConfig({ instanceId, instructions: defaultInstructions }),
            );
          }}
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Reset
        </Button>
      </div>
      <Textarea
        id="instructions"
        value={value}
        onChange={(e) =>
          dispatch(updateConfig({ instanceId, instructions: e.target.value }))
        }
        disabled={disabled}
        rows={14}
        className="font-mono text-xs leading-relaxed resize-none"
        spellCheck={false}
      />
    </div>
  );
}
