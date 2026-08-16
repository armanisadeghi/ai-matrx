"use client";

// features/vision-interview/components/VisionInterviewListPage.tsx
//
// /vision-interview — the feature's entry LIST page on the canonical
// entity-list shell (config: ../browse/listConfig.tsx).

import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { sessionListConfig } from "../browse/listConfig";
import { NewInterviewButton } from "./NewInterviewDialog";

export function VisionInterviewListPage() {
  const newButton = <NewInterviewButton />;

  return (
    <>
      <PageHeader>
        <div className="flex w-full min-w-0 items-center p-0">
          <h1 className="ml-2 truncate text-sm font-medium text-foreground">
            Vision Interviews
          </h1>
        </div>
      </PageHeader>
      <EntityListPage
        config={sessionListConfig}
        headerActions={newButton}
        emptyAction={newButton}
      />
    </>
  );
}
