"use client";
// features/voice-agent/components/playground/PlaygroundSettingsSheet.tsx
//
// Right-side panel hosting the playground knobs. Locked while a session
// is active (changes apply on next session start).
//
// Also the registration point for the `matrx-user/chat-voice` surface's write
// targets: this component owns `instanceId` and is the ONLY thing that renders
// the editable controls, and it renders only on /chat/voice/playground. The
// intro route mounts the same SurfaceRuntimeProvider but reaches this file
// never, so an agent there is offered no write tool — which is correct, since
// `updateConfig` is a silent no-op for the intro preset. Registration is at
// this level rather than inside the panel body so the targets stay live while
// the sheet is CLOSED (the panel unmounts its children).

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
import { useSurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { CHAT_VOICE_SURFACE } from "@/features/surfaces/manifests/chat-voice.manifest";
import { useVoicePlaygroundWriteHandlers } from "../../hooks/useVoicePlaygroundWriteHandlers";
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

  // Write targets for `matrx-user/chat-voice`. The handlers read the live
  // store at call time, so they do not depend on this component re-rendering
  // when the session status changes.
  useSurfaceWriteHandlers(
    CHAT_VOICE_SURFACE,
    useVoicePlaygroundWriteHandlers(instanceId),
  );

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
