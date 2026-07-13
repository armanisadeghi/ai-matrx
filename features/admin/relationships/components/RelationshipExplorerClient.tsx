"use client";

// features/admin/relationships/components/RelationshipExplorerClient.tsx
//
// Explorer tab of the Relationships hub: pick any entity type, then open its
// orbit view as a full page (explorer/[token]) or in a WindowPanel.

import { Search } from "lucide-react";

import { EntityExplorerEntry } from "./EntityExplorerEntry";
import type { RelationshipRule } from "../types";

interface Props {
  rules: RelationshipRule[];
}

export function RelationshipExplorerClient({ rules }: Props) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Search className="h-4 w-4" />
          Entity explorer
          <span className="font-normal text-muted-foreground">
            — sources on the left, targets on the right, for any entity type
          </span>
        </h2>
        <EntityExplorerEntry rules={rules} />
      </section>
    </div>
  );
}
