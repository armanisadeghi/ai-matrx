"use client";

// features/war-room/components/all/UnassignedThreadsSection.tsx
//
// Dedicated inbox on `/war-room/all` for threads with no `thread → war_room`
// edge. Browse-only — attach to an existing room or open in a new one.

import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrphanThreadIds } from "@/features/war-room/redux/selectors";
import { UNASSIGNED_SECTION_LABEL } from "@/features/war-room/constants";
import { OrphanThreadRow } from "./OrphanThreadRow";

export function UnassignedThreadsSection() {
  const orphanIds = useAppSelector(selectOrphanThreadIds);
  if (orphanIds.length === 0) return null;

  return (
    <section>
      <div className="mb-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {UNASSIGNED_SECTION_LABEL}
          <span className="ml-1.5 tabular-nums font-medium normal-case tracking-normal">
            ({orphanIds.length})
          </span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
          These threads aren&apos;t in any War Room yet. Attach one to an
          existing room, or open it in a new room to work with it.
        </p>
      </div>
      <ul className="space-y-2 max-w-3xl">
        {orphanIds.map((id) => (
          <OrphanThreadRow key={id} threadId={id} />
        ))}
      </ul>
    </section>
  );
}
