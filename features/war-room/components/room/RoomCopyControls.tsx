"use client";

// features/war-room/components/room/RoomCopyControls.tsx
//
// The room page's whole-page copy: a quick CopyButtons pair whose plain click
// is the what-I-see payload, plus the AgentCopyGroomerLauncher for grooming a
// busy room down before copying.
//
// A room is threads × attached resources, which reaches the "massive" size
// class fast — so a single button here would be a defect. The section list is
// declared ONCE in `lib/copy.ts` (`roomGroomerConfig`) and feeds all three
// consumers: the Groomer window, the quick "Everything" payload, and the
// Balanced/Minimal preset variants via the shared `groomerPresetVariants` /
// `buildGroomerPresetPayload` helpers. There is no second section list.
//
// This is additive: `RoomProjectCopyForAiButton` (the room's anchored-project
// export) still renders beside it, unchanged.

import { useAppSelector } from "@/lib/redux/hooks";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { jsonExportItem, csvExportItem } from "@/components/agent-copy/export";
import { AgentCopyGroomerLauncher } from "@/components/agent-copy/AgentCopyGroomerLauncher";
import {
  buildGroomerPresetPayload,
  groomerPresetVariants,
} from "@/components/agent-copy/groomer-types";
import {
  selectAssignmentsByContainer,
  selectHiddenThreads,
  selectOrderedGalleryThreadIds,
  selectSessionById,
  selectThreadsById,
  selectThreadUserStateById,
} from "@/features/war-room/redux/selectors";
import { containerKey } from "@/features/war-room/types";
import type {
  WarRoomAssignment,
  WarRoomThread,
} from "@/features/war-room/types";
import {
  roomGroomerConfig,
  roomPageHuman,
  threadRow,
  type RoomCopyInput,
  type ThreadCopyInput,
} from "@/features/war-room/lib/copy";

const NO_ASSIGNMENTS: WarRoomAssignment[] = [];

export function RoomCopyControls({ sessionId }: { sessionId: string }) {
  const session = useAppSelector(selectSessionById(sessionId));
  const visibleIds = useAppSelector(selectOrderedGalleryThreadIds(sessionId));
  const hidden = useAppSelector(selectHiddenThreads(sessionId));
  const threadsById = useAppSelector(selectThreadsById);
  const userStateById = useAppSelector(selectThreadUserStateById);
  const assignmentsByContainer = useAppSelector(selectAssignmentsByContainer);

  if (!session) return null;

  const toCopyInput = (thread: WarRoomThread): ThreadCopyInput => ({
    thread,
    session,
    assignments:
      assignmentsByContainer[containerKey("thread", thread.id)] ??
      NO_ASSIGNMENTS,
    isPinned: userStateById[thread.id]?.isPinned ?? false,
    isHidden: userStateById[thread.id]?.isHidden ?? false,
  });

  // Built fresh on every click, never memoized at render — the gallery
  // reorders, tiles get parked, resources get attached, and the payload must
  // be what is on screen at the moment the user copies.
  const gather = (): RoomCopyInput => ({
    session,
    threads: visibleIds
      .map((id) => threadsById[id])
      .filter((t): t is WarRoomThread => !!t)
      .map(toCopyInput),
    hiddenThreads: hidden.map(toCopyInput),
    roomAssignments:
      assignmentsByContainer[containerKey("room", sessionId)] ?? NO_ASSIGNMENTS,
  });

  return (
    <>
      <CopyButtons
        size="icon"
        label={`War Room ${session.title}`}
        human={() => roomPageHuman(gather())}
        json={() => {
          const input = gather();
          return {
            room: input.session,
            threads: input.threads.map(threadRow),
          };
        }}
        agent={() =>
          buildGroomerPresetPayload(roomGroomerConfig(gather()), "everything")
        }
        agentVariant={{
          id: "this-room",
          label: "This room",
          hint: "Every tile and every attached resource",
          position: "first",
        }}
        aiVariants={groomerPresetVariants(() => roomGroomerConfig(gather()))}
      />
      <ExportMenu
        label={`War Room ${session.title}`}
        items={[
          jsonExportItem(() => {
            const input = gather();
            return {
              room: input.session,
              threads: input.threads.map(threadRow),
            };
          }),
          csvExportItem(() => {
            const input = gather();
            return input.threads.map((t) => {
              const row = threadRow(t);
              const { resources: _resources, resource_counts, ...rest } = row;
              return {
                ...rest,
                resource_counts: JSON.stringify(resource_counts ?? {}),
              };
            });
          }, "CSV (thread tiles)"),
        ]}
      />
      <AgentCopyGroomerLauncher
        config={() => roomGroomerConfig(gather())}
        buttonLabel="Groom"
        className="h-7 shrink-0 px-2 text-xs"
      />
    </>
  );
}
