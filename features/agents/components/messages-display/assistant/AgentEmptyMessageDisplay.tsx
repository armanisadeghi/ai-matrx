import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstanceAgentName } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectInstanceAgentDescription } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { Webhook } from "lucide-react";
import type { RootState } from "@/lib/redux/store";
import MarkdownStream from "@/components/MarkdownStream";
import IconResolver from "@/components/official/icons/IconResolver.dynamic";

export function AgentEmptyMessageDisplay({
  conversationId,
}: {
  conversationId: string;
}) {
  // Surfaces that want their own identity (agent-apps, embedded iframes)
  // set `displayNameOverride` / `displayDescriptionOverride` /
  // `displayIconNameOverride` on the instance UI state. Falls back to
  // the agent's name/description and a built-in Webhook icon.
  const nameOverride = useAppSelector(
    (state: RootState) =>
      state.instanceUIState.byConversationId[conversationId]
        ?.displayNameOverride,
  );
  const descriptionOverride = useAppSelector(
    (state: RootState) =>
      state.instanceUIState.byConversationId[conversationId]
        ?.displayDescriptionOverride,
  );
  const iconNameOverride = useAppSelector(
    (state: RootState) =>
      state.instanceUIState.byConversationId[conversationId]
        ?.displayIconNameOverride,
  );
  const agentName = useAppSelector(selectInstanceAgentName(conversationId));
  const agentDescription = useAppSelector(
    selectInstanceAgentDescription(conversationId),
  );

  const displayName = nameOverride || agentName;
  const displayDescription =
    descriptionOverride !== null && descriptionOverride !== undefined
      ? descriptionOverride
      : agentDescription;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6 py-12">
      <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center">
        {iconNameOverride ? (
          <IconResolver
            iconName={iconNameOverride}
            className="w-12 h-12 text-primary"
            fallbackIcon="Webhook"
          />
        ) : (
          <Webhook className="w-12 h-12 text-primary" />
        )}
      </div>
      <div className="space-y-3 max-w-md mx-auto">
        <p className="text-lg font-medium">{displayName ?? "Ready to run"}</p>
        {displayDescription && (
          <MarkdownStream content={displayDescription} hideCopyButton={true} />
        )}
        {!displayDescription && (
          <p className="text-sm text-muted-foreground mt-1">
            Fill in any variables below and type a message to start.
          </p>
        )}
      </div>
    </div>
  );
}
