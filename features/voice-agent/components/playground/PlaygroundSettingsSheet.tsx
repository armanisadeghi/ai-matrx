"use client";
// features/voice-agent/components/playground/PlaygroundSettingsSheet.tsx
//
// Right-side panel hosting the playground knobs. Locked while a session
// is active (changes apply on next session start).

import {
  cloneElement,
  isValidElement,
  useState,
  type ReactElement,
  type ReactNode,
  type MouseEvent,
} from "react";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
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

function wrapTrigger(trigger: ReactNode, onOpen: () => void) {
  if (isValidElement(trigger)) {
    const el = trigger as ReactElement<{ onClick?: (e: MouseEvent) => void }>;
    return cloneElement(el, {
      onClick: (e: MouseEvent) => {
        el.props.onClick?.(e);
        onOpen();
      },
    });
  }
  return (
    <button type="button" onClick={onOpen} className="contents">
      {trigger}
    </button>
  );
}

export function PlaygroundSettingsSheet({
  instanceId,
  trigger,
  disabled,
}: PlaygroundSettingsSheetProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {wrapTrigger(trigger, () => setOpen(true))}
      <MatrxDynamicPanelHost
        open={open}
        onOpenChange={setOpen}
        title="Voice settings"
        description={
          disabled
            ? "Stop the current session to change settings."
            : "Tune the voice, tools, and instructions for the next session."
        }
        position="right"
        defaultSize={32}
        contentClassName="flex min-h-0 flex-1 flex-col p-0"
      >
        <Separator />
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
          <VoicePicker instanceId={instanceId} disabled={disabled} />
          <Separator />
          <ToolToggleList instanceId={instanceId} disabled={disabled} />
          <Separator />
          <InstructionsEditor instanceId={instanceId} disabled={disabled} />
        </div>
      </MatrxDynamicPanelHost>
    </>
  );
}
