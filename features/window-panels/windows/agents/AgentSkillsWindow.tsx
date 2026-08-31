"use client";

/**
 * AgentSkillsWindow
 *
 * Non-blocking floating window hosting `SkillConfigPicker` for one agent's
 * `skill_config`. Replaces the old blocking `AgentSkillsModal` dialog — the
 * user can keep editing the agent (instructions, model, variables) while the
 * skills catalogue stays open beside it.
 *
 * The skill_config save piggybacks on the existing agent save flow —
 * `setAgentSkillConfig` marks the field dirty and the next `saveAgent` thunk
 * picks it up via `agentDefinitionToUpdate`'s skill_config branch.
 */

import { useCallback, useState } from "react";
import { Lightbulb } from "lucide-react";

import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentSkillConfig, selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentSkillConfig } from "@/features/agents/redux/agent-definition/slice";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { SkillConfigPicker } from "@/features/skills/components/SkillConfigPicker";
import type { SkillConfig } from "@/features/skills/types";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { useAgentMenuSection, agentEntityRef } from "@/features/agents/menu/agent-actions";
import { useOpenAgentContentWindow } from "@/features/overlays/openers/agentAdvancedEditorWindow";

interface AgentSkillsWindowProps {
  isOpen: boolean;
  onClose: () => void;
  agentId: string | null;
}

const WINDOW_ID = "agent-skills-window";
const OVERLAY_ID = "agentSkillsWindow";

export default function AgentSkillsWindow({
  isOpen,
  onClose,
  agentId,
}: AgentSkillsWindowProps) {
  if (!isOpen || !agentId) return null;
  return <AgentSkillsWindowInner onClose={onClose} agentId={agentId} />;
}

function AgentSkillsWindowInner({
  onClose,
  agentId,
}: {
  onClose: () => void;
  agentId: string;
}) {
  const dispatch = useAppDispatch();
  const skillConfig = useAppSelector((state) =>
    selectAgentSkillConfig(state, agentId),
  );
  const agentName = useAppSelector((state) => selectAgentName(state, agentId) ?? null);
  const openAgentContentWindow = useOpenAgentContentWindow();
  const agentSection = useAgentMenuSection({
    agentId,
    agentName,
    onRefresh: () => dispatch(fetchFullAgent(agentId)),
    onOpenBuilder: () => openAgentContentWindow({ initialAgentId: agentId }),
  });

  const handleChange = useCallback(
    (next: SkillConfig) => {
      dispatch(setAgentSkillConfig({ id: agentId, skillConfig: next }));
    },
    [agentId, dispatch],
  );

  const totalConfigured =
    skillConfig.included.length +
    skillConfig.listed.length +
    skillConfig.forbidden.length;

  // The catalogue wants ~1180px, but `registerWindow` does NOT clamp the
  // initial rect to the viewport — an unclamped 1180 on a 768-wide tablet
  // hangs the right column off-screen where the user can't reach it.
  const [{ width, height }] = useState(() => ({
    width: Math.min(1180, Math.max(360, window.innerWidth - 64)),
    height: Math.min(760, Math.max(320, window.innerHeight - 64)),
  }));

  return (
    <WindowPanel
      id={WINDOW_ID}
      overlayId={OVERLAY_ID}
      titleNode={
        <span className="flex items-center gap-1.5">
          <Lightbulb className="h-3.5 w-3.5 text-primary" />
          Agent Skills
          {totalConfigured > 0 && (
            <span className="rounded-sm bg-primary/15 px-1 text-[10px] font-medium tabular-nums text-primary">
              {totalConfigured}
            </span>
          )}
        </span>
      }
      onClose={onClose}
      width={width}
      height={height}
      minWidth={360}
      minHeight={360}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {/* Per-catalog-skill identity (`skill` token exists) lives inside
          `SkillConfigPicker`'s own internal selection state — out of scope
          here. The entity below is this window's actual subject: the agent
          whose skill_config is being edited. */}
      {/* context-menu-exempt: surfaceName — no registered surface manifest for this window */}
      <NonEditableContextMenu
        sourceFeature="agent-builder"
        contentSource={{ type: "raw" }}
        entity={agentEntityRef(agentId, agentName)}
        extraSections={[agentSection]}
      >
        <SkillConfigPicker value={skillConfig} onChange={handleChange} />
      </NonEditableContextMenu>
    </WindowPanel>
  );
}
