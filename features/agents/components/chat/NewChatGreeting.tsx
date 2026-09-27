"use client";

import { useRouter } from "next/navigation";
import { useAppStore } from "@/lib/redux/hooks";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "./chat-quick-actions.config";
import { stageChatAgentSwitch } from "./begin-fresh-chat";
import { ConnectorPromptHost } from "@/features/connectors/ConnectorPromptHost";
import { SmartAgentInput } from "@/features/agents/components/inputs/smart-input/SmartAgentInput";
import {
  ComposerGreeting,
  ComposerQuickActions,
} from "@/features/agents/components/inputs/smart-input/composer/ComposerSplash";
import type { ComposerPresentation } from "@/features/agents/components/inputs/smart-input/composer/composer-types";
import { IntelligenceIndicator } from "@/features/mandates/feature-intelligence/IntelligenceIndicator";

interface NewChatGreetingProps {
  /** Default-agent conversation bound to the splash composer — same Redux
   *  state as every SmartAgentInput. Carries the draft on a quick-action click
   *  and is the target of the splash's submit. Null while it is created. */
  sourceConversationId: string | null;
  /** Surface key forwarded to the composer's smartExecute dispatch. */
  surfaceKey: string;
  /** The three-mode composer (composer/FEATURE.md), rendered at `splash` size. */
  composer: ComposerPresentation;
}

/**
 * `/chat/new` — the design's splash, vertically centered: greeting · the ONE
 * composer at `splash` size · one scrolling row of quick actions.
 *
 * Every quick action is a MANDATE listed by the `agents.chat_composer.quick_actions`
 * knob and resolved for this person by `ComposerQuickActions`. Clicking one
 * carries the complete in-progress request to the resolved agent in memory and
 * routes to `/chat/a/[agentId]` (`stageChatAgentSwitch`) — a navigation to the
 * agent's fresh-chat route, never a launch with a resolved id.
 */
export function NewChatGreeting({
  sourceConversationId,
  surfaceKey,
  composer,
}: NewChatGreetingProps) {
  const router = useRouter();
  const store = useAppStore();

  const handleQuickAction = (agentId: string) => {
    stageChatAgentSwitch({
      dispatch: store.dispatch,
      router,
      getState: store.getState,
      targetAgentId: agentId,
      sourceConversationId,
    });
  };

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <div className="flex w-full max-w-[760px] flex-col items-center gap-4">
        <ComposerGreeting className="mb-4" />
        {/* The first Google moment (PLAN §2): a dismissible card above the
            composer; it removes itself once anything is connected. */}
        <div className="w-full">
          <ConnectorPromptHost />
        </div>
        {sourceConversationId ? (
          <SmartAgentInput
            conversationId={sourceConversationId}
            surfaceKey={surfaceKey}
            sendButtonVariant="blue"
            showSubmitOnEnterToggle={false}
            composer={{ ...composer, size: "splash", placeholder: "How can I help you today?" }}
          />
        ) : (
          <ChatSplashComposerShell />
        )}
        <ComposerQuickActions
          className="w-full max-w-[720px]"
          onLaunchAgent={handleQuickAction}
          trailing={(mandateKeys) => (
            <IntelligenceIndicator
              feature="chat"
              mandateKeys={[DEFAULT_NEW_CHAT_MANDATE_KEY, ...mandateKeys]}
              label="The chat assistant and these quick starts"
            />
          )}
        />
      </div>
    </div>
  );
}

/** The splash composer's footprint while its conversation is created. */
export function ChatSplashComposerShell() {
  return (
    <div
      aria-hidden
      className="h-[132px] w-full max-w-[760px] animate-pulse rounded-[22px] border border-border bg-card"
    />
  );
}
