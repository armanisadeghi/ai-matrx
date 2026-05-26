"use client";
// features/voice-agent/components/playground/PlaygroundSettingsSheet.tsx
//
// Right-side <Sheet> hosting the playground knobs. Locked while a session
// is active (changes apply on next session start).

import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { VoicePicker } from "./VoicePicker";
import { ToolToggleList } from "./ToolToggleList";
import { InstructionsEditor } from "./InstructionsEditor";

interface PlaygroundSettingsSheetProps {
  instanceId: string;
  trigger: ReactNode;
  /** Lock controls while the session is active (changes won't apply mid-call). */
  disabled?: boolean;
}

export function PlaygroundSettingsSheet({
  instanceId,
  trigger,
  disabled,
}: PlaygroundSettingsSheetProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col gap-0 p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-3">
          <SheetTitle>Voice settings</SheetTitle>
          <SheetDescription>
            {disabled
              ? "Stop the current session to change settings."
              : "Tune the voice, tools, and instructions for the next session."}
          </SheetDescription>
        </SheetHeader>
        <Separator />
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
          <VoicePicker instanceId={instanceId} disabled={disabled} />
          <Separator />
          <ToolToggleList instanceId={instanceId} disabled={disabled} />
          <Separator />
          <InstructionsEditor instanceId={instanceId} disabled={disabled} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
