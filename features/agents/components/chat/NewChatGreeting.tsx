"use client";

import { useRouter } from "next/navigation";
import { ArrowUp, ArrowUpRight, Mic, Plus } from "lucide-react";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectActiveUserName } from "@/lib/redux/selectors/userSelectors";
import { selectUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.selectors";
import {
  PRIMARY_QUICK_ACTIONS,
  SECONDARY_QUICK_ACTIONS,
  type ChatQuickAction,
} from "./chat-quick-actions.config";
import { useMandateSet } from "@/features/agents/mandates/useMandateSet";
import { stashChatDraftTransfer } from "./chat-draft-transfer";
import { NewChatLandingInput } from "./NewChatLandingInput";
import { ChatConnectorStrip } from "@/features/connectors/ChatConnectorStrip";
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
 * Every chip is a MANDATE (`chat.quick_*`), resolved for this user in one pass
 * by `useMandateSet` (system default → their own binding). Clicking a chip
 * carries any in-progress draft to the RESOLVED agent via sessionStorage and
 * routes to `/chat/a/[agentId]` — a navigation to the agent's fresh-chat
 * route, never a launch with a resolved id. A chip whose mandate cannot
 * resolve renders disabled with the reason as its title (the unresolved
 * posture: no silent UUID fallback, no hidden failure).
 *
 * Chip catalog lives in `chat-quick-actions.config.ts`.
 */

const ALL_QUICK_ACTION_KEYS: readonly string[] = [
  ...PRIMARY_QUICK_ACTIONS,
  ...SECONDARY_QUICK_ACTIONS,
].map((action) => action.mandateKey);

const OPTIONAL_QUICK_ACTION_KEYS: readonly string[] = ["chat.quick_org_chart"];

export function NewChatGreeting({
  sourceConversationId,
  surfaceKey,
}: NewChatGreetingProps) {
  const router = useRouter();
  const store = useAppStore();
  const userName = useAppSelector(selectActiveUserName);
  const firstName = (userName ?? "").trim().split(/\s+/)[0] || "";
  const mandates = useMandateSet(ALL_QUICK_ACTION_KEYS, {
    optionalKeys: OPTIONAL_QUICK_ACTION_KEYS,
  });

  const chipState = (action: ChatQuickAction) => {
    const state = mandates[action.mandateKey];
    const agentId = state?.mandate?.agentId ?? null;
    const unavailable = Boolean(state && !state.loading && state.error);
    return {
      agentId,
      unavailable,
      // Disabled while resolving (no flash of a dead click) and when unresolved.
      disabled: !agentId,
      title: unavailable
        ? `"${action.label}" is not available yet — its agent has not been assigned (${action.mandateKey}).`
        : undefined,
    };
  };

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
          {PRIMARY_QUICK_ACTIONS.map((action) => {
            const chip = chipState(action);
            return (
              <button
                key={action.mandateKey}
                type="button"
                disabled={chip.disabled}
                title={chip.title}
                onClick={() => chip.agentId && handleChipClick(chip.agentId)}
                className={cn(
                  "group inline-flex items-center gap-1.5 cursor-pointer",
                  "disabled:cursor-not-allowed",
                  chip.unavailable && "opacity-50",
                  "min-h-11 rounded-full border border-border/80 bg-card",
                  "px-4 text-sm text-foreground/90",
                  "shadow-[0_1px_0_0_rgba(255,255,255,0.6)_inset,0_1px_2px_0_rgba(0,0,0,0.06)]",
                  "dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.4)]",
                  "hover:bg-accent hover:border-border hover:text-foreground",
                  "active:translate-y-px active:shadow-none",
                  "transition-all",
                )}
              >
                <span>{action.label}</span>
                <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
              </button>
            );
          })}
        </section>

        {/* Hero input */}
        {sourceConversationId && (
          <div className="w-full">
            <NewChatLandingInput
              conversationId={sourceConversationId}
              surfaceKey={surfaceKey}
            />
            {/* The first-run offer. This is the screen where a brand-new user
                learns what a conversation could reach — the one place the
                reminder matters most. */}
            <ChatConnectorStrip className="mt-2 justify-center" />
          </div>
        )}
        {!sourceConversationId && (
          <div className="w-full">
            <NewChatLandingInputShell />
            <ChatConnectorStrip className="mt-2 justify-center" />
          </div>
        )}

        {/* 4 secondary chips — smaller/lighter, centered under the input */}
        <section
          aria-label="More actions"
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {SECONDARY_QUICK_ACTIONS.map((action) => {
            const chip = chipState(action);
            return (
              <button
                key={action.mandateKey}
                type="button"
                disabled={chip.disabled}
                title={chip.title}
                onClick={() => chip.agentId && handleChipClick(chip.agentId)}
                className={cn(
                  "inline-flex items-center cursor-pointer border border-border/70 bg-card/60",
                  "disabled:cursor-not-allowed",
                  chip.unavailable && "opacity-50",
                  "min-h-11 rounded-full px-3 py-1.5 text-xs",
                  "shadow-[0_1px_0_0_rgba(255,255,255,0.5)_inset,0_1px_1px_0_rgba(0,0,0,0.04)]",
                  "dark:shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset,0_1px_1px_0_rgba(0,0,0,0.3)]",
                  "text-muted-foreground hover:text-foreground hover:bg-accent",
                  "active:translate-y-px active:shadow-none",
                  "transition-all",
                )}
              >
                {action.label}
              </button>
            );
          })}
        </section>
      </div>
    </div>
  );
}

function NewChatLandingInputShell() {
  return (
    <div
      data-chat-new-input-shell="true"
      className={cn(
        "w-full rounded-[28px] border border-border bg-card",
        "shadow-[0_2px_16px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_1px_2px_0_rgba(0,0,0,0.4)]",
        "p-2.5 flex flex-col",
      )}
      aria-hidden
    >
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-1.5">
        <div className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground/70">
          <Plus className="h-5 w-5" />
        </div>
        <div className="min-h-11 px-2 py-2 text-base leading-7 text-muted-foreground/60">
          Ask anything
        </div>
        <div className="flex items-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground/70">
            <Mic className="h-4 w-4" />
          </div>
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground/20 text-background">
            <ArrowUp className="h-5 w-5" />
          </div>
        </div>
      </div>
    </div>
  );
}
