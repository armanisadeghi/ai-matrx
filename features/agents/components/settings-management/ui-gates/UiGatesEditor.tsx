"use client";

/**
 * UiGatesEditor — builder adapter for frontend input capabilities.
 *
 * The input-capability flags (`tools`, `image_urls`, `file_urls`,
 * `youtube_videos`) MOVED OUT of `agent.settings` into the FE-only
 * `agent.uiGates` column (see lib/redux/slices/agent-settings/ui-gates.ts).
 * They are NO LONGER settings rows. All supported frontend capabilities are
 * always shown: selected-model compatibility is handled by the server and must
 * never suppress an authored agent configuration. Writes go through
 * `setAgentUiGates` — never `setAgentSettings` (the save-time sanitizer strips
 * gate keys from settings, so writing them there silently no-ops).
 */

import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectAgentUiGates } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentUiGates } from "@/features/agents/redux/agent-definition/slice";
import type { UiGateEditableKey } from "@/lib/redux/slices/agent-settings/ui-gates";
import { InputCapabilitiesEditor } from "./InputCapabilitiesEditor";

interface UiGatesEditorProps {
  agentId: string;
}

export function UiGatesEditor({ agentId }: UiGatesEditorProps) {
  const dispatch = useAppDispatch();
  const uiGates = useAppSelector((state) => selectAgentUiGates(state, agentId));

  const setGate = (key: UiGateEditableKey, next: boolean) => {
    dispatch(
      setAgentUiGates({
        id: agentId,
        uiGates: { ...uiGates, [key]: next },
      }),
    );
  };

  return (
    <InputCapabilitiesEditor
      values={uiGates}
      onChange={setGate}
      idPrefix={`agent-ui-gate-${agentId}`}
    />
  );
}
