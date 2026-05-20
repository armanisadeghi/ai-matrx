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
import { cn } from "@/lib/utils";

interface NewChatGreetingProps {
  /**
   * The conversation currently bound to the input on the new-chat page —
   * used to read any draft text the user has already typed so we can carry
   * it to the agent they pick.
   */
  sourceConversationId: string | null;
}

/**
 * Empty-state surface shown on `/chat/new`. Greets the user, then offers
 * two rows of agent shortcuts. Clicking a chip routes to `/chat/a/[agentId]`
 * and forwards any in-progress draft via sessionStorage so it lands in the
 * destination agent's input bar.
 *
 * The chip catalog lives in `chat-quick-actions.config.ts` — edit that file
 * to rearrange or swap agents without touching this component.
 */
export function NewChatGreeting({ sourceConversationId }: NewChatGreetingProps) {
  const router = useRouter();
  const store = useAppStore();
  const userName = useAppSelector(selectActiveUserName);
  // First name only — "Hello, Arman" feels right; "Hello, Arman Sadeghi"
  // does not. Falls back gracefully when full name isn't populated.
  const firstName = (userName ?? "").trim().split(/\s+/)[0] || "";

  const handleChipClick = (agentId: string) => {
    // Snapshot the draft AT click time — not via a subscribed selector — so
    // we don't re-render this component on every keystroke. `getState()` is
    // a one-shot read.
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
      <div className="mx-auto max-w-3xl w-full px-6 py-12 sm:py-16 flex flex-col gap-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-3xl sm:text-4xl font-semibold text-foreground tracking-tight">
            {firstName ? `Hello, ${firstName}` : "Hello"}
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground">
            How can I help you today?
          </p>
        </header>

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

        <section
          aria-label="More actions"
          className="flex flex-wrap gap-2"
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
