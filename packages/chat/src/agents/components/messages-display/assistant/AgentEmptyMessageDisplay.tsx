import { useAppSelector } from "../../../../store/hooks";
import { selectInstanceAgentName } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { selectInstanceAgentDescription } from "../../../redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { Webhook } from "lucide-react";
import { IconResolver } from "../../../../next/lazy/IconResolver";
import type { ChatRootState } from "../../../../store/root-state";
// The MarkdownStream FRONT DOOR (already a dynamic ssr:false shell) — never
// re-wrap or bypass it with a second boundary on MarkdownStreamImpl; that
// duplicated the whole rich-document engine into a second chunk group.
import { RichContent } from "@host/components/rich-content/RichContent";
import { selectVisibleInputDefinitions } from "../../../redux/execution-system/instance-variable-values/bound-variable.selectors";
import { selectIsVariableFormShown } from "../../../redux/execution-system/selectors/aggregate.selectors";
import { emptyStateInstruction } from "./empty-state-instruction";

/** Beyond this length the empty-state background shows description only. */
const LONG_DESCRIPTION_CHAR_THRESHOLD = 1000;

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
    (state: ChatRootState) =>
      state.instanceUIState.byConversationId[conversationId]
        ?.displayNameOverride,
  );
  const descriptionOverride = useAppSelector(
    (state: ChatRootState) =>
      state.instanceUIState.byConversationId[conversationId]
        ?.displayDescriptionOverride,
  );
  const iconNameOverride = useAppSelector(
    (state: ChatRootState) =>
      state.instanceUIState.byConversationId[conversationId]
        ?.displayIconNameOverride,
  );
  const agentName = useAppSelector(selectInstanceAgentName(conversationId));
  const agentDescription = useAppSelector(
    selectInstanceAgentDescription(conversationId),
  );

  // Variables that draw a form on this run: the form, not the composer, is
  // what the person fills in.
  const formFields = useAppSelector(
    selectVisibleInputDefinitions(conversationId),
  );
  // ...but only when this surface shows the form. A hidden form (pre-filled
  // variables, "Hide Form Inputs") leaves the composer as the only input.
  const formShown = useAppSelector(selectIsVariableFormShown(conversationId));

  const displayName = nameOverride || agentName;
  const displayDescription =
    descriptionOverride !== null && descriptionOverride !== undefined
      ? descriptionOverride
      : agentDescription;

  const instruction = emptyStateInstruction({
    formFieldCount: formFields.length,
    formShown,
    hasDescription: !!displayDescription,
  });

  const isLongDescription =
    (displayDescription?.length ?? 0) > LONG_DESCRIPTION_CHAR_THRESHOLD;

  if (isLongDescription && displayDescription) {
    return (
      <div className="flex flex-col h-full justify-start text-left px-6 py-8 max-w-3xl mx-auto w-full">
        <RichContent level="full" imagePolicy="other" source={displayDescription} hideCopyButton={true} />
        {instruction && (
          <p className="text-sm text-muted-foreground mt-3">{instruction}</p>
        )}
      </div>
    );
  }

  return (
    // Short pane (a split canvas pane, a landscape phone): the hero icon steps
    // aside and the padding shrinks, so the name and description stay above
    // the composer; anything still too tall scrolls instead of centering off
    // both edges (`justify-center-safe`).
    <div className="flex flex-col items-center justify-center-safe h-full gap-3 text-center px-6 py-12 [@container(max-height:420px)]:py-3 [@container(max-height:420px)]:gap-1.5">
      <div className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center [@container(max-height:420px)]:hidden">
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
      <div className="space-y-3 mx-auto">
        <p className="text-lg font-medium">{displayName ?? "Ready to run"}</p>
        {displayDescription && (
          <RichContent level="full" imagePolicy="other" source={displayDescription} hideCopyButton={true} />
        )}
        {instruction && (
          <p className="text-sm text-muted-foreground mt-1">{instruction}</p>
        )}
      </div>
    </div>
  );
}
