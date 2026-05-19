"use client";

/**
 * BuilderAutoClearButton
 *
 * Two responsibilities:
 *  1. On mount, seeds the instance's autoClearConversation from the user's
 *     saved prompts preference (autoClearResponsesInEditMode).
 *  2. Renders a toggle button that keeps both the instance state AND the
 *     saved preference in sync when clicked.
 *
 * Renders nothing until conversationId is ready — safe to always mount.
 * Used by AgentBuilderRightPanel instead of SmartAgentInput's generic
 * showAutoClearToggle, so that the preference round-trip is handled here.
 */

import { useEffect } from "react";
import { RefreshCcw } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectPromptsPreferences } from "@/lib/redux/preferences/userPreferenceSelectors";
import { setModulePreferences } from "@/lib/redux/preferences/userPreferencesSlice";
import { selectAutoClearConversation } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setAutoClearConversation } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";

interface BuilderAutoClearButtonProps {
  conversationId: string | null;
}

export function BuilderAutoClearButton({
  conversationId,
}: BuilderAutoClearButtonProps) {
  const dispatch = useAppDispatch();

  const savedPref = useAppSelector(
    (state) => selectPromptsPreferences(state).autoClearResponsesInEditMode,
  );

  const instanceAutoClear = useAppSelector((state) =>
    conversationId
      ? selectAutoClearConversation(conversationId)(state)
      : undefined,
  );

  // Seed the instance from the saved preference when the instance becomes ready.
  useEffect(() => {
    if (!conversationId || instanceAutoClear === undefined) return;
    dispatch(setAutoClearConversation({ conversationId, value: savedPref }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  if (!conversationId || instanceAutoClear === undefined) return null;

  const handleToggle = () => {
    const next = !instanceAutoClear;
    // Update the instance UI state
    dispatch(setAutoClearConversation({ conversationId, value: next }));
    // Persist to user preferences
    dispatch(
      setModulePreferences({
        module: "prompts",
        preferences: { autoClearResponsesInEditMode: next },
      }),
    );
  };

  return (
    <button
      type="button"
      onClick={handleToggle}
      title={
        instanceAutoClear
          ? "Auto-clear ON — each send starts fresh (click to disable)"
          : "Auto-clear OFF — conversation continues (click to enable)"
      }
      className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
        instanceAutoClear
          ? "text-primary bg-primary/10"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}
    >
      <RefreshCcw className="w-3.5 h-3.5" />
    </button>
  );
}
