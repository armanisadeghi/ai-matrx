"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button as ControlButton } from "@ai-matrx/design-system/controls";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { rulebookListConfig } from "../listConfig";

export function MasterworkStudioPage() {
  const newBtn = (
    <ControlButton variant="primary" asChild aria-label="New Masterwork">
      <Link href="/masterwork/new">
        <Plus className="h-4 w-4" />
        <span className="max-sm:sr-only">New Masterwork</span>
      </Link>
    </ControlButton>
  );

  return (
    <EntityListPage
      config={rulebookListConfig}
      headerActions={newBtn}
      emptyAction={newBtn}
    />
  );
}
