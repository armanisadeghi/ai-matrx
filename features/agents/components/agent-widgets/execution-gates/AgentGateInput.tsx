"use client";

/**
 * @registry-status: sub-component
 * Exports `AgentGateBody`, the body of `agentGateWindow`. Consumed by the
 * registered shell at features/window-panels/windows/agents/AgentGateWindow.tsx.
 * Do NOT register separately — covered by `agentGateWindow`.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowLeftFromLine, ArrowRight, ArrowUp, X } from "lucide-react";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import {
  selectPreExecutionMessage,
  selectInstanceAgentName,
  selectBypassGateSeconds,
} from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setPreExecutionSatisfied } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { destroyInstanceIfAllowed } from "@/features/agents/redux/execution-system/conversations/conversations.thunks";
import { closeOverlay, openOverlay } from "@/lib/redux/slices/overlaySlice";
import { SmartAgentInput } from "../../inputs/smart-input/SmartAgentInput";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { PaperPlaneIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/ButtonMine";
import type { OverlayId } from "@/features/window-panels/registry/overlay-ids";

// ─── WindowPanel body — used by AgentGateWindow ───────────────────────────────

export function AgentGateBody({
  conversationId,
  windowInstanceId,
  downstreamOverlayId,
  onClose,
}: {
  conversationId: string;
  windowInstanceId: string;
  downstreamOverlayId?: OverlayId;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const agentName = useAppSelector(selectInstanceAgentName(conversationId));
  const preExecutionMessage = useAppSelector(
    selectPreExecutionMessage(conversationId),
  );
  const bypassGateSeconds = useAppSelector(
    selectBypassGateSeconds(conversationId),
  );

  const closeGate = () => {
    dispatch(
      closeOverlay({
        overlayId: "agentGateWindow",
        instanceId: windowInstanceId,
      }),
    );
  };

  const handleContinue = () => {
    // 1. Mark gate satisfied so execute thunks will proceed
    dispatch(setPreExecutionSatisfied({ conversationId, value: true }));
    // 2. Close the gate window
    closeGate();
    // 3. Open the real downstream overlay now that the gate is cleared
    if (downstreamOverlayId) {
      dispatch(
        openOverlay({
          overlayId: downstreamOverlayId,
          instanceId: conversationId,
          data: { conversationId },
        }),
      );
    }
    onClose();
  };

  // ── Bypass countdown ────────────────────────────────────────────────────
  // When bypassGateSeconds > 0, auto-advance after N seconds unless the user
  // types into the input (interaction cancels the timer).
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    bypassGateSeconds > 0 ? bypassGateSeconds : null,
  );
  const autoAdvancedRef = useRef(false);

  useEffect(() => {
    if (bypassGateSeconds <= 0) return;
    if (autoAdvancedRef.current) return;

    const tick = window.setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          window.clearInterval(tick);
          if (!autoAdvancedRef.current) {
            autoAdvancedRef.current = true;
            handleContinue();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(tick);
    // handleContinue closes over dispatch + args; stable within this mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bypassGateSeconds]);

  const cancelCountdown = () => {
    autoAdvancedRef.current = true;
    setSecondsLeft(null);
  };

  const handleCancel = () => {
    // Destroy the instance — nothing downstream was ever opened, so we just clean up
    dispatch(destroyInstanceIfAllowed(conversationId));
    closeGate();
    onClose();
  };

  const footerRight = (
    <Button onClick={handleContinue} size="icon" variant="primary">
      <PaperPlaneIcon />
    </Button>
  );
  const footerLeft = (
    <Button onClick={handleCancel} size="icon" variant="secondary">
      <ArrowLeftFromLine />
    </Button>
  );

  const baseTitle = preExecutionMessage || agentName || "Provide Details";
  const title =
    secondsLeft !== null && secondsLeft > 0
      ? `${baseTitle} · auto-continue in ${secondsLeft}s`
      : baseTitle;

  return (
    <WindowPanel
      id={`agent-gate-${windowInstanceId}`}
      title={title}
      onClose={handleCancel}
      width={500}
      height={420}
      minWidth={360}
      minHeight={200}
      position="center"
      bodyClassName="p-0 flex flex-col"
      footerRight={footerRight}
      footerLeft={footerLeft}
      overlayId="agentGateWindow"
      onCollectData={() => ({ conversationId })}
    >
      <div
        className="flex flex-col flex-1 min-h-0 justify-end"
        onKeyDown={cancelCountdown}
        onPointerDown={cancelCountdown}
      >
        <SmartAgentInput
          conversationId={conversationId}
          singleRowTextarea={false}
          compact={true}
          showSendButton={false}
          showVariableIcon={false}
          showSubmitOnEnterToggle={false}
          disableSend
        />
      </div>
    </WindowPanel>
  );
}
