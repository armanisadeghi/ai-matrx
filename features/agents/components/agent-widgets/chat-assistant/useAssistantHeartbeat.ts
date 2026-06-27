"use client";

import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectModeState } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { updateModeState } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";

const HEARTBEAT_STEPS = [0, 15, 30, 60, 120, 300];

export function useAssistantHeartbeat(conversationId: string) {
  const dispatch = useAppDispatch();
  const modeState = useAppSelector(selectModeState(conversationId));
  const heartbeatInterval = (modeState?.heartbeatInterval as number) ?? 0;

  // NOTE: there is intentionally no setInterval here. The heartbeat feature is
  // not implemented yet — the previous skeleton spun a real timer with an empty
  // body, so any session with a non-zero heartbeat setting burned a ticking,
  // re-creating interval that did nothing. The interval (with real
  // context-push/trigger logic) must be (re)added here WHEN the feature is
  // wired; until then the setting is just persisted state driving the UI below.

  const setHeartbeatInterval = (seconds: number) => {
    dispatch(
      updateModeState({
        conversationId,
        changes: { heartbeatInterval: seconds },
      }),
    );
  };

  const increaseHeartbeat = () => {
    const currentIdx = HEARTBEAT_STEPS.indexOf(heartbeatInterval);
    const nextIdx = Math.min(
      currentIdx < 0 ? 1 : currentIdx + 1,
      HEARTBEAT_STEPS.length - 1,
    );
    setHeartbeatInterval(HEARTBEAT_STEPS[nextIdx]);
  };

  const decreaseHeartbeat = () => {
    const currentIdx = HEARTBEAT_STEPS.indexOf(heartbeatInterval);
    const nextIdx = Math.max(currentIdx < 0 ? 0 : currentIdx - 1, 0);
    setHeartbeatInterval(HEARTBEAT_STEPS[nextIdx]);
  };

  const triggerHeartbeat = () => {
    // Skeleton: manual trigger. Wire real logic later.
  };

  return {
    heartbeatInterval,
    setHeartbeatInterval,
    increaseHeartbeat,
    decreaseHeartbeat,
    triggerHeartbeat,
  };
}
