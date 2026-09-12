import { ConversationsBrowse } from "../conversations/components/ConversationsBrowse";

export { AI_WORK_DOOR_GROUPS } from "./AiWorkDestinationNavigation";

export function AiWorkOverview() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden pt-[var(--shell-header-h)]">
      <div className="min-h-0 flex-1">
        <ConversationsBrowse embedded />
      </div>
    </div>
  );
}
