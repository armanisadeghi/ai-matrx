"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button as ControlButton } from "@ai-matrx/design-system/controls";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { rulebookListConfig } from "../listConfig";

export function MasterworkStudioPage() {
  const newBtn = (
    <ControlButton variant="primary" asChild aria-label="New Masterwork" icon={<Plus className="h-4 w-4" />} collapse="container">
      <Link href="/masterwork/new">
        New Masterwork
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
