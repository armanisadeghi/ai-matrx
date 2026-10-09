// /messenger — the desktop messenger over people conversations. The shell's
// list title row is static top UI, so the body clears the glass header with
// --shell-header-h (core-route-headers, body type "static top").

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { MESSENGER_LABEL } from "@/features/messaging/messenger/messenger-route";
import { MessengerPeopleRoute } from "@/features/messaging/messenger/MessengerPeopleRoute";

export default function MessengerPage() {
  return (
    <>
      <PageHeader>
        <RouteHeader
          left={<h1 className="truncate px-1.5 text-sm font-medium text-foreground">{MESSENGER_LABEL}</h1>}
        />
      </PageHeader>
      <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
        <MessengerPeopleRoute />
      </div>
    </>
  );
}
