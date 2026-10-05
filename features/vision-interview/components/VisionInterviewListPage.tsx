"use client";

// features/vision-interview/components/VisionInterviewListPage.tsx
//
// /vision-interview — the feature's entry LIST page on the canonical
// entity-list shell (config: ../browse/listConfig.tsx).

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { sessionListConfig } from "../browse/listConfig";
import { NewInterviewButton } from "./NewInterviewDialog";

export function VisionInterviewListPage() {
  const newButton = <NewInterviewButton />;

  return (
    <>
      <RecordPageHeader record={{ name: "Vision Interviews" }} />
      <EntityListPage
        config={sessionListConfig}
        headerActions={newButton}
        emptyAction={newButton}
      />
    </>
  );
}
