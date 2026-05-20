"use client";

import { useRouter } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
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
  /** Default-agent conversation bound to the landing input — same Redux state
   *  as the standard SmartAgentInput. Carries the user's draft on a chip click
   *  and is the target of the landing input's submit. */
  sourceConversationId: string | null;
  /** Surface key forwarded to the landing input's smartExecute dispatch. */
  surfaceKey: string;
}

/**
 * Vertically-centered landing surface for `/chat/new` — modeled on the
 * ChatGPT composer screen.
 *
 * Layout (centered in the viewport):
 *   greeting → 5 primary action chips (compact, wrapping — deliberately NOT
 *   the same width/shape as the input) → hero input → 4 secondary chips.
 *
 * Clicking a chip carries any in-progress draft to the destination agent via
 * sessionStorage and routes to `/chat/a/[agentId]`. Submitting the hero input
 * fires `smartExecute` against the default agent.
 *
 * Chip catalog lives in `chat-quick-actions.config.ts`.
 */
export function NewChatGreeting({
  sourceConversationId,
  surfaceKey,
}: NewChatGreetingProps) {
  const router = useRouter();
  const store = useAppStore();
  const userName = useAppSelector(selectActiveUserName);
  const firstName = (userName ?? "").trim().split(/\s+/)[0] || "";

  const handleChipClick = (agentId: string) => {
    // Snapshot the draft at click time via getState — no per-keystroke
    // subscription, so typing never re-renders the chips.
    const draftText = sourceConversationId
      ? selectUserInputText(sourceConversationId)(store.getState())
      : "";
    if (draftText && draftText.trim().length > 0) {
      stashChatDraftTransfer({ text: draftText, targetAgentId: agentId });
    }
    router.push(`/chat/a/${encodeURIComponent(agentId)}`);
  };

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl flex flex-col items-center gap-7">
        {/* Greeting — fluid type, centered */}
        <header className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-[clamp(1.75rem,1.4rem+1.6vw,2.75rem)] font-semibold text-foreground tracking-tight">
            {firstName ? `Hello, ${firstName}` : "Hello"}
          </h1>
          <p className="text-[clamp(1rem,0.95rem+0.4vw,1.25rem)] text-muted-foreground">
            How can I help you today?
          </p>
        </header>

        {/* 5 primary chips — compact, wrapping, centered. Distinct from the
            hero input below (auto width, lighter weight, trailing arrow). */}
        <section
          aria-label="Suggested agents"
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {PRIMARY_QUICK_ACTIONS.map((action) => (
            <button
              key={action.id}
              type="button"
              onClick={() => handleChipClick(action.id)}
              className={cn(
                "group inline-flex items-center gap-1.5",
                "rounded-full border border-border/70 bg-card/50",
                "px-3.5 py-2 text-sm text-foreground/90",
                "hover:bg-accent/60 hover:border-border hover:text-foreground",
                "transition-colors",
              )}
            >
              <span>{action.label}</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
            </button>
          ))}
        </section>

        {/* Hero input */}
        {sourceConversationId && (
          <div className="w-full">
            <NewChatLandingInput
              conversationId={sourceConversationId}
              surfaceKey={surfaceKey}
            />
          </div>
        )}

        {/* 4 secondary chips — smaller/lighter, centered under the input */}
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
                "inline-flex items-center",
                "rounded-full px-3 py-1.5 text-xs",
                "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                "transition-colors",
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
