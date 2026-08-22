"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityListPage } from "@/lib/entity-list/components/EntityListPage";
import { rulebookListConfig } from "../listConfig";

export function MasterworkStudioPage() {
  const newBtn = (
    <Button asChild size="sm" className="h-11 lg:h-7" aria-label="New Masterwork">
      <Link href="/masterwork/new">
        <Plus className="h-4 w-4" />
        <span className="max-sm:sr-only">New Masterwork</span>
      </Link>
    </Button>
  );

  return (
    <EntityListPage
      config={rulebookListConfig}
      headerActions={newBtn}
      emptyAction={newBtn}
    />
  );
}
