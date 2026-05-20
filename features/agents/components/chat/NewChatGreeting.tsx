"use client";

import { useRouter } from "next/navigation";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectActiveUserName } from "@/lib/redux/selectors/userSelectors";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import {
  PRIMARY_QUICK_ACTIONS,
  SECONDARY_QUICK_ACTIONS,
} from "./chat-quick-actions.config";
import { stashChatDraftTransfer } from "./chat-draft-transfer";
import { NewChatLandingInput } from "./NewChatLandingInput";
import { cn } from "@/lib/utils";

interface NewChatGreetingProps {
  /**
   * The default-agent conversation bound to the landing input — same Redux
   * state as the standard SmartAgentInput. Carries the user's draft when a
   * chip is clicked and is the target of the landing input's submit.
   */
  sourceConversationId: string | null;
  /** Surface key forwarded to the landing input's smartExecute dispatch. */
  surfaceKey: string;
}

/**
 * Landing surface shown above an empty conversation on `/chat/new`.
 *
 * Layout (top → bottom, centered):
 *   - Greeting: "Hello, <FirstName>" / "How can I help you today?"
 *   - 5 primary agent chips (full-width pill rows)
 *   - The minimal landing input (pill: upload / textarea / mic / send)
 *   - 4 secondary agent chips (compact pills, centered under the input)
 *
 * Clicking a chip carries any in-progress draft to the destination agent
 * via sessionStorage. Submitting through the landing input fires
 * `smartExecute` against the default agent — the same path the standard
 * SmartAgentInput uses — so streaming starts immediately.
 *
 * The chip catalog lives in `chat-quick-actions.config.ts`.
 */
export function NewChatGreeting({
  sourceConversationId,
  surfaceKey,
}: NewChatGreetingProps) {
  const router = useRouter();
  const store = useAppStore();
  const userName = useAppSelector(selectActiveUserName);
  // First name only — "Hello, Arman" feels right; full name does not.
  const firstName = (userName ?? "").trim().split(/\s+/)[0] || "";

  const handleChipClick = (agentId: string) => {
    // Snapshot the draft AT click time — not via a subscribed selector — so
    // we don't re-render this component on every keystroke.
    const draftText = sourceConversationId
      ? selectUserInputText(sourceConversationId)(store.getState())
      : "";
    if (draftText && draftText.trim().length > 0) {
      stashChatDraftTransfer({ text: draftText, targetAgentId: agentId });
    }
    router.push(`/chat/a/${encodeURIComponent(agentId)}`);
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="mx-auto max-w-2xl w-full px-6 pt-12 sm:pt-16 pb-8 flex flex-col gap-6">
        {/* Greeting */}
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl sm:text-4xl font-semibold text-foreground tracking-tight">
            {firstName ? `Hello, ${firstName}` : "Hello"}
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground">
            How can I help you today?
          </p>
        </header>

        {/* 5 primary chips */}
        <section
          aria-label="Quick actions"
          className="flex flex-col gap-2"
        >
          {PRIMARY_QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleChipClick(action.id)}
              className={cn(
                "group inline-flex items-center justify-between gap-3 w-full text-left",
                "rounded-full border border-border bg-card/60 hover:bg-accent/60 hover:border-border/80",
                "px-4 py-2.5 text-sm text-foreground transition-colors",
              )}
            >
              <span className="truncate">{action.label}</span>
              <span
                aria-hidden
                className="text-muted-foreground group-hover:text-foreground transition-colors"
              >
                →
              </span>
            </button>
          ))}
        </section>

        {/* Minimal landing input — only mounts when we have a conversation
            to bind to (the launcher's pre-created default-agent instance) */}
        {sourceConversationId && (
          <NewChatLandingInput
            conversationId={sourceConversationId}
            surfaceKey={surfaceKey}
          />
        )}

        {/* 4 secondary chips — centered under the input */}
        <section
          aria-label="More actions"
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {SECONDARY_QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleChipClick(action.id)}
              className={cn(
                "inline-flex items-center gap-2",
                "rounded-full border border-border bg-card/40 hover:bg-accent/60 hover:border-border/80",
                "px-3 py-1.5 text-xs text-foreground transition-colors",
              )}
            >
              {action.label}
            </button>
          ))}
        </section>
      </div>
    </div>
  );
}
