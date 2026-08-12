"use client";

// features/canvas/maps/MapsListPage.tsx
//
// /maps — the library. Feature entry pages are LIST views (CLAUDE.md), so this
// is a list of everything you can open or make, never a forced editor.

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { mapListConfig } from "./listConfig";
import { NewMapDialog } from "./NewMapDialog";

export function MapsListPage() {
  const [creating, setCreating] = useState(false);

  const newButton = (
    <Button size="sm" className="h-11 lg:h-7" onClick={() => setCreating(true)}>
      <Plus className="h-4 w-4" />
      <span className="max-sm:sr-only">New map</span>
    </Button>
  );

  return (
    <>
      <PageHeader>
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="truncate text-sm font-semibold text-foreground">Maps</h1>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            Pictures of how things work
          </span>
        </div>
      </PageHeader>
      <EntityListPage
        config={mapListConfig}
        headerActions={newButton}
        emptyAction={newButton}
      />
      <NewMapDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
