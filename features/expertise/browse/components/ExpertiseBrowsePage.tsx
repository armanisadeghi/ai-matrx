"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { expertiseListConfig } from "../listConfig";
import { NewPackDialog } from "./NewPackDialog";

export function ExpertiseBrowsePage() {
  const [creating, setCreating] = useState(false);

  const newBtn = (
    <Button
      size="sm"
      className="h-11 lg:h-7"
      onClick={() => setCreating(true)}
      aria-label="New expertise pack"
    >
      <Plus className="h-4 w-4" />
      <span className="max-sm:sr-only">New pack</span>
    </Button>
  );

  return (
    <>
      <EntityListPage
        config={expertiseListConfig}
        headerActions={newBtn}
        emptyAction={newBtn}
      />
      <NewPackDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
