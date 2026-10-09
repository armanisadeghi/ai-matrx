"use client";

/**
 * An honest route for a Socials tab another lane is still building: the
 * promise is the `lib/coming-soon/registry.ts` row (never a bare string), and
 * the one action announces it through the shared host. Never a blank page.
 */

import { Hourglass } from "lucide-react";

import { Button, EmptyState } from "@ai-matrx/design-system/controls";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { getComingSoon } from "@/lib/coming-soon/registry";

export function SocialsTabPlaceholder({ comingSoonId }: { comingSoonId: string }) {
  const entry = getComingSoon(comingSoonId);
  if (!entry) {
    throw new Error(`SocialsTabPlaceholder: "${comingSoonId}" is missing its lib/coming-soon/registry.ts row.`);
  }
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <EmptyState
        icon={<Hourglass className="h-5 w-5" />}
        title={entry.label}
        line="Not built yet"
        action={
          <Button variant="outline" onClick={() => void announceComingSoon(comingSoonId)}>
            What's planned
          </Button>
        }
      />
    </div>
  );
}
