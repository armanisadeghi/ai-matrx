"use client";

// features/agents/browse/components/ClassicViewNotice.tsx
//
// Temporary escape hatch for the /agents cutover: the new list is now the
// standard page, and this points anyone who wants it at the old gallery.
//
// Dismissal is stored per-user in the synced preferences blob, not
// localStorage — someone who dismisses it on a laptop should not meet it again
// on their phone.
//
// DELETE THIS COMPONENT, its preference key, and /agents/classic together once
// the grace period ends (planned ~mid-August 2026). A "temporary" banner with
// no removal date is how a banner becomes permanent.

import Link from "next/link";
import { Rows3, X } from "lucide-react";
import { useSetting } from "@/features/settings/hooks/useSetting";

export function ClassicViewNotice() {
  const [dismissed, setDismissed] = useSetting<boolean>(
    "userPreferences.display.agentsClassicNoticeDismissed",
  );

  if (dismissed) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs sm:flex-nowrap">
      <Rows3 className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="min-w-48 flex-1 text-foreground">
        This is the new Agents list — scopes, full filtering, and inline
        editing.
      </span>
      <Link
        href="/agents/classic"
        className="inline-flex min-h-11 shrink-0 items-center font-medium text-primary hover:underline sm:min-h-0"
      >
        Use the classic view
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground sm:h-6 sm:w-6"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
