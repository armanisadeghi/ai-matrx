"use client";

import { ChevronLeft } from "lucide-react";
import { Chip, ChipSet, Button } from "@ai-matrx/design-system/controls";
import { useResponseModeAgents } from "../agent/useResponseModeAgents";

// ── Response Mode Buttons ─────────────────────────────────────────────────────
// Each mode is a MANDATE (RESPONSE_MODE_MANDATE_MAP), resolved for this user by
// useResponseModeAgents. A mode whose mandate cannot resolve is disabled with
// the reason as its title — never a silent fallback to a hardcoded agent id.

interface ResponseModeButtonsProps {
  disabled?: boolean;
  selectedAgentId?: string | null;
  onModeSelect?: (modeId: string, agentId: string | null) => void;
}

export function ResponseModeButtons({
  disabled,
  selectedAgentId,
  onModeSelect,
}: ResponseModeButtonsProps) {
  const { modes, modeForAgent } = useResponseModeAgents();
  const activeMode = selectedAgentId ? modeForAgent(selectedAgentId) : "text";

  return (
    <ChipSet className="justify-center">
      {modes.map((entry) => {
        const isActive = activeMode === entry.mode;
        const isMapped = entry.agentId !== null;
        const unresolved = entry.mandateKey !== null && entry.error !== null;
        return (
          <Chip
            key={entry.mode}
            asChild
            pressed={isActive}
            label={entry.mode}
            title={
              unresolved
                ? `Not available yet — no agent is assigned (${entry.mandateKey})`
                : undefined
            }
          >
            <button
              type="button"
              onClick={() => {
                if (disabled || !entry.agentId) return;
                onModeSelect?.(entry.mode, entry.agentId);
              }}
              disabled={disabled || !isMapped}
            />
          </Chip>
        );
      })}
    </ChipSet>
  );
}

// ── Back To Start Button ──────────────────────────────────────────────────────

interface BackToStartButtonProps {
  onBack: () => void;
  agentName?: string;
}

export function BackToStartButton({
  onBack,
  agentName,
}: BackToStartButtonProps) {
  return (
    <Button variant="quiet" icon={<ChevronLeft />} onClick={onBack} title="Back to agent selection">{agentName || "Back"}</Button>
  );
}
