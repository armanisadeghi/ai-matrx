import { ConversationsBrowse } from "../conversations/components/ConversationsBrowse";

export { AI_WORK_DOOR_GROUPS } from "./AiWorkDestinationNavigation";

export function AiWorkOverview() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border/70 bg-background/80 px-3 pb-2 pt-[calc(var(--shell-header-h)+0.5rem)] backdrop-blur-sm sm:px-4">
        <h1 className="text-sm font-semibold text-foreground">AI Work</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Continue AI chats and inspect work delivered from connected coding
          tools.
        </p>
      </div>
      <div className="min-h-0 flex-1">
        <ConversationsBrowse embedded />
      </div>
    </div>
  );
}
