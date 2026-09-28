"use client";

/**
 * The Everything view's empty state action: one button. Adding a Source is the
 * header's Add; this opens what others already share.
 */

import Link from "next/link";
import { Library } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HUB_LIBRARY_CATALOG_HREF } from "@/features/knowledge/hub/legacyRoutes";

export function HubGettingStarted() {
  return (
    <Button asChild size="sm" variant="outline" className="h-8 gap-1.5">
      <Link href={HUB_LIBRARY_CATALOG_HREF}>
        <Library className="h-4 w-4" /> Browse shared libraries
      </Link>
    </Button>
  );
}
