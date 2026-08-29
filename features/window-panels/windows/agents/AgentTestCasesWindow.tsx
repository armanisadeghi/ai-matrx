"use client";

import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { isJsonObject } from "@/types/json";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import {
  setUserInputMessageParts,
  setUserInputText,
} from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import {
  sampleAttachmentParts,
  sampleInputText,
  type AgentSampleRow,
} from "@/features/agents/samples/service";
import { AgentSamplesManager } from "@/features/agents/components/samples/AgentSamplesManager";
import { WindowPanel } from "@/features/window-panels/WindowPanel";

interface AgentTestCasesWindowProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string;
  conversationId: string;
}

const WINDOW_ID = "agent-test-cases-window";
const OVERLAY_ID = "agentTestCasesWindow";

export default function AgentTestCasesWindow({
  isOpen,
  onClose,
  agentId,
  conversationId,
}: AgentTestCasesWindowProps) {
  const dispatch = useAppDispatch();

  if (!isOpen || !agentId || !conversationId) return null;

  function applySample(sample: AgentSampleRow) {
    const values = isJsonObject(sample.variables) ? sample.variables : {};
    dispatch(setUserVariableValues({ conversationId, values }));
    dispatch(
      setUserInputText({
        conversationId,
        text: sampleInputText(sample),
        userValues: values,
      }),
    );
    const attachmentParts = sampleAttachmentParts(sample);
    dispatch(
      setUserInputMessageParts({
        conversationId,
        parts: attachmentParts.length > 0 ? attachmentParts : null,
      }),
    );
    toast.success(`Loaded “${sample.label}”`);
    onClose();
  }

  return (
    <WindowPanel
      id={WINDOW_ID}
      overlayId={OVERLAY_ID}
      onClose={onClose}
      title="Test cases"
      width={560}
      height={620}
      minWidth={420}
      minHeight={360}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
        <AgentSamplesManager agentId={agentId} onUseSample={applySample} />
      </div>
    </WindowPanel>
  );
}
