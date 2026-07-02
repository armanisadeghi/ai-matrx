"use client";

// components/diff/LegacyDiffChip.tsx
//
// Admin-only marker for a diff renderer that is NOT the canonical
// components/diff system — either legacy (superseded) or coupled (bound to
// editor/Redux/tool state so it couldn't be migrated). It explains, on hover,
// what this renderer is and why it wasn't transitioned, and clicking opens the
// Diff Gallery (/demos/diff-gallery) in a new tab to compare it against the
// canonical family.
//
// Lazy admin check: reads the already-hydrated `userAuth.isAdmin` boolean
// (no fetch, one cheap selector) and renders NOTHING for non-admins — so it
// adds no cost or visual noise for real users.

import { FlaskConical } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";

const GALLERY_URL = "/demos/diff-gallery";

export function LegacyDiffChip({
  reason,
  label = "non-canonical diff",
  className,
}: {
  /** A few words: what this renderer is + why it wasn't transitioned. */
  reason: string;
  label?: string;
  className?: string;
}) {
  const isAdmin = useAppSelector(selectIsAdmin);
  if (!isAdmin) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        window.open(GALLERY_URL, "_blank", "noopener,noreferrer");
      }}
      title={`${reason} — click to open the Diff Gallery and compare all diff renderers`}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 transition-colors hover:bg-amber-500/20 dark:text-amber-400",
        className,
      )}
    >
      <FlaskConical className="h-3 w-3" />
      {label}
    </button>
  );
}

export default LegacyDiffChip;
