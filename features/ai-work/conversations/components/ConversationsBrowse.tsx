"use client";

// features/ai-work/conversations/components/ConversationsBrowse.tsx
//
// /work/conversations — the canonical entity-list shell, plus the two things
// this surface owes the user above the table: the honest audience switch (the
// door to the internal machine runs the default hides) and the sync verdict.

import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { conversationListConfig } from "../listConfig";
import type { ConversationBrowseRow } from "../types";
import { ConversationAudienceFilter } from "./ConversationAudienceFilter";
import { SyncStateIndicator } from "./SyncStatePanel";

export function ConversationsBrowse() {
  return (
    <EntityListPage<ConversationBrowseRow>
      config={conversationListConfig}
      notice={(list) => (
        <div className="space-y-1.5">
          <SyncStateIndicator />
          <ConversationAudienceFilter list={list} />
        </div>
      )}
    />
  );
}
