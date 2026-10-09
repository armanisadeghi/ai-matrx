// /messenger/agents — the messenger over the agents you know. The list's title
// row is static top UI, so the body clears the glass header with
// --shell-header-h (core-route-headers, body type "static top").

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { MESSENGER_AGENTS_LABEL } from "@/features/messaging/messenger/messenger-route";
import { MessengerAgentsRoute } from "@/features/messaging/messenger/MessengerAgentsRoute";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = (value: string | string[] | undefined) =>
  typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;

export default async function MessengerAgentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const initialLocation = { agentId: uuidOrNull(params.agent), conversationId: uuidOrNull(params.thread) };
  return (
    <>
      <PageHeader>
        <RouteHeader
          left={<span className="flex items-center px-1.5 text-sm font-medium text-foreground">{MESSENGER_AGENTS_LABEL}</span>}
        />
      </PageHeader>
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <MessengerAgentsRoute initialLocation={initialLocation} />
      </div>
    </>
  );
}
