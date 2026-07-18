"use client";

// Shapes list header — injected into the shell header center (the /agents/all
// pattern): identity left, the ONE primary action (New Shape) right.

import Link from "next/link";
import { Plus, Shapes } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SHAPES_FEATURE_LABEL,
  SHAPES_NEW_HREF,
} from "@/features/content-ir/studio/constants";

export function ShapesListHeader() {
  return (
    <div className="flex w-full items-center gap-2 px-1">
      <Shapes className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-sm font-semibold text-foreground">
        {SHAPES_FEATURE_LABEL}
      </span>
      <Button asChild size="sm" className="ml-auto h-7 gap-1.5 px-2 text-xs">
        <Link href={SHAPES_NEW_HREF}>
          <Plus className="h-3.5 w-3.5" />
          New Shape
        </Link>
      </Button>
    </div>
  );
}
