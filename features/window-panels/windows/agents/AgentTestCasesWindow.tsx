"use client";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { applySampleToComposer } from "@/features/agents/samples/apply-sample";
import type { AgentSampleRow } from "@/features/agents/samples/service";
import { AgentSamplesManager } from "@/features/agents/components/samples/AgentSamplesManager";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildAgentMenuSection, agentEntityRef } from "@ai-matrx/chat/agents/menu/agent-actions";
import {
  fetchFullAgent,
} from "@/features/agents/redux/fetch-full-agent.thunk";
import { useOpenAgentContentWindow } from "@/features/overlays/openers/agentAdvancedEditorWindow";
import type { RootState } from "@/lib/redux/store";
import { useAgentName } from "@ai-matrx/chat/agents/identity/agent-identity";

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
  const agentName = useAgentName(agentId) ?? null;
  const openAgentContentWindow = useOpenAgentContentWindow();

  const agentSection = buildAgentMenuSection({
    agentId,
    agentName,
    onRefresh: () => dispatch(fetchFullAgent(agentId)),
    onOpenBuilder: () => openAgentContentWindow({ initialAgentId: agentId }),
  });

  if (!isOpen || !agentId || !conversationId) return null;

  function applySample(sample: AgentSampleRow) {
    const unattached = dispatch(applySampleToComposer({ conversationId, sample }));
    toast.success(`Loaded “${sample.label}”`);
    if (unattached.length > 0) {
      toast.warning("Some test inputs have no chip", {
        description: `Still sent, not shown: ${unattached.map((part) => part.type).join(", ")}`,
      });
    }
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
      {/* Row identity is `agent.exemplar` (`AgentSampleRow`), but the manager
          that renders those rows (`AgentSamplesManager`) is a shared component
          rendered by 2 surfaces (this window and the system-agents admin
          samples page) and owns its selection internally — out of scope here
          to reach into. The entity below is this window's actual subject: the
          agent whose test cases are being browsed. */}
      {/* context-menu-exempt: surfaceName — no registered surface manifest for this window */}
      <NonEditableContextMenu
        sourceFeature="agent-builder"
        contentSource={{ type: "raw" }}
        entity={agentEntityRef(agentId, agentName)}
        extraSections={[agentSection]}
      >
        <div className="min-h-0 flex-1 overflow-y-auto p-3 scrollbar-thin">
          <AgentSamplesManager agentId={agentId} onUseSample={applySample} />
        </div>
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
