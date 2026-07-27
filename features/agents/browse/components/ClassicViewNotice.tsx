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
import { Sparkles, X } from "lucide-react";
import { useSetting } from "@/features/settings/hooks/useSetting";

export function ClassicViewNotice() {
  const [dismissed, setDismissed] = useSetting<boolean>(
    "userPreferences.display.agentsClassicNoticeDismissed",
  );

  if (dismissed) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-1.5 text-xs">
      <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
      <span className="flex-1 text-foreground">
        This is the new Agents list — scopes, full filtering, and inline editing.
      </span>
      <Link
        href="/agents/classic"
        className="shrink-0 font-medium text-primary hover:underline"
      >
        Use the classic view
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
