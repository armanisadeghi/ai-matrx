// app/(core)/compare/old/_components/OldPageBanner.tsx
//
// The thin strip every review-only old page carries (Arman, 2026-09-29):
// "Old page, kept for comparison" plus a link to the live page that replaced
// it. Fixed to the bottom of the viewport so it never disturbs the old page's
// own header and scroll layout. Deleted with the whole compare/old tree once
// Arman confirms the comparison (KNOWLEDGE-HUB STATE teardown row).

import Link from "next/link";

export function OldPageBanner({ newHref, newLabel }: { newHref: string; newLabel: string }) {
  return (
    <div
      role="note"
      className="pointer-events-none fixed inset-x-0 bottom-3 z-[60] flex justify-center px-4"
    >
      <div className="pointer-events-auto flex max-w-full items-center gap-3 rounded-full border border-amber-500/40 bg-amber-50/95 px-4 py-1.5 text-xs text-amber-900 shadow-md backdrop-blur dark:bg-amber-950/90 dark:text-amber-100">
        <span className="font-medium">Old page, kept for comparison</span>
        <span aria-hidden className="text-amber-500">·</span>
        <Link href={newHref} className="truncate underline underline-offset-2 hover:no-underline">
          Open the new page: {newLabel}
        </Link>
        <span aria-hidden className="text-amber-500">·</span>
        <Link href="/compare/old" className="underline underline-offset-2 hover:no-underline">
          All old pages
        </Link>
      </div>
    </div>
  );
}
