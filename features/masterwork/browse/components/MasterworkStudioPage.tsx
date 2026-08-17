"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { rulebookListConfig } from "../listConfig";
import { NewRulebookDialog } from "./NewRulebookDialog";

export function MasterworkStudioPage() {
  const [creating, setCreating] = useState(false);

  const newBtn = (
    <Button
      size="sm"
      className="h-11 lg:h-7"
      onClick={() => setCreating(true)}
      aria-label="New Rulebook"
    >
      <Plus className="h-4 w-4" />
      <span className="max-sm:sr-only">New Rulebook</span>
    </Button>
  );

  return (
    <>
      <EntityListPage
        config={rulebookListConfig}
        headerActions={newBtn}
        emptyAction={newBtn}
      />
      <NewRulebookDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
