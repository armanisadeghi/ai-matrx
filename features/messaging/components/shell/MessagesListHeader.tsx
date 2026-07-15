"use client";

// Canonical header for the /messages hub (list) route — injected into the
// shell header center zone via <RouteHeader>. Replaces the legacy
// PageSpecificHeader/MessagesHeaderCompact portal.
//
// The "New conversation" action lives inside ConversationList's own
// sub-toolbar (search + "+"), which is a legitimate sub-toolbar per
// features/shell/components/header/variants/USAGE.md — no duplicate action
// needed up here.

import RouteHeader from "@/features/shell/components/header/RouteHeader";

export function MessagesListHeader() {
  return (
    <RouteHeader
      left={
        <span className="flex items-center px-1.5 text-sm font-medium text-foreground">
          Messages
        </span>
      }
    />
  );
}
