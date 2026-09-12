"use client";

// features/ai-work/conversations/components/ConversationsBrowse.tsx
//
// /work/conversations — the canonical entity-list shell, plus the two things
// this surface owes the user above the table: the honest audience switch (the
// door to the internal machine runs the default hides) and the sync verdict.

import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { CaptureGapAlertConnected } from "@/features/agent-connections/coding-sessions/CaptureGapAlert";
import { AiWorkDestinationNavigation } from "../../components/AiWorkDestinationNavigation";
import { conversationListConfig } from "../listConfig";
import type { ConversationBrowseRow } from "../types";
import { ConversationAudienceFilter } from "./ConversationAudienceFilter";
import { SyncStateIndicator } from "./SyncStatePanel";

export function ConversationsBrowse({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  return (
    <EntityListPage<ConversationBrowseRow>
      config={conversationListConfig}
      clearsShellHeader={!embedded}
      notice={(list) => (
        <div className="space-y-1.5">
          {embedded && <AiWorkDestinationNavigation list={list} />}
          {/*
            This inbox is where a capture outage is actually FELT — an empty or
            stale list here is indistinguishable from a quiet day unless the
            surface says so. Renders nothing while capture is healthy.
          */}
          {!embedded && <CaptureGapAlertConnected />}
          <SyncStateIndicator />
          <ConversationAudienceFilter list={list} />
        </div>
      )}
    />
  );
}
