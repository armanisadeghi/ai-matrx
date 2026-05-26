"use client";
// features/voice-agent/components/playground/InstructionsEditor.tsx
//
// Free-form instructions for the playground variant. The intro route locks
// these and never renders this component.

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { INTRO_INSTRUCTIONS } from "../../constants";
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
          disabled={disabled || value === INTRO_INSTRUCTIONS}
          onClick={() =>
            dispatch(
              updateConfig({ instanceId, instructions: INTRO_INSTRUCTIONS }),
            )
          }
        >
          <RotateCcw className="h-3.5 w-3.5 mr-1" />
          Reset
        </Button>
      </div>
      <Textarea
        id="instructions"
        value={value}
        onChange={(e) =>
          dispatch(
            updateConfig({ instanceId, instructions: e.target.value }),
          )
        }
        disabled={disabled}
        rows={14}
        className="font-mono text-xs leading-relaxed resize-none"
        spellCheck={false}
      />
    </div>
  );
}
