"use client";
// Next binding (slice P10): the dynamic() front door moved verbatim from the package call site.
// `next/dynamic` is imported here, literally, so Next's transform still applies.

import dynamic from "next/dynamic";

export const NoteVersionHistoryPanel = dynamic(
  () =>
    import("@host/features/notes/components/diff/NoteVersionHistoryPanel").then(
      (m) => ({ default: m.NoteVersionHistoryPanel }),
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">
        Loading version history…
      </div>
    ),
  },
);
