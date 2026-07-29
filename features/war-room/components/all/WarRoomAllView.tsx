"use client";

// features/war-room/components/all/WarRoomAllView.tsx
//
// Browse + manage saved War Rooms. List view (the "savior" page) — never traps
// the user in a single room. Create / open / delete from here.
//
// Header conformance: route chrome lives in the shell header via <PageHeader>
// (HeaderToggle: Rooms | Threads center toggle + declarative actions that
// collapse to a bottom sheet on mobile). The body is `h-full overflow-hidden`
// and starts below the glass via `pt-[var(--shell-header-h)]` (cards and the
// table carry interactive controls at the top, so nothing may slide behind
// the glass).

import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderToggle from "@/features/shell/components/header/variants/variants/HeaderToggle";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import {
  selectListStatus,
  selectOrphanThreadIds,
  selectSessionsList,
} from "@/features/war-room/redux/selectors";
import {
  createWarRoomSession,
  loadSessionsList,
} from "@/features/war-room/redux/thunks";
import { closeAllWatches } from "@/features/war-room/redux/watchSlice";
import { useWarRoomAllSearch } from "@/features/war-room/hooks/useWarRoomAllSearch";
import { WarRoomSearchField } from "@/features/war-room/components/shared/WarRoomSearchField";
import { SessionCard } from "./SessionCard";
import { WarRoomThreadHitRow } from "./WarRoomThreadHitRow";
import { UnassignedThreadsSection } from "./UnassignedThreadsSection";
import { NewSessionButton } from "./NewSessionButton";
import { NewRoomFromProjectDialog } from "./NewRoomFromProjectDialog";
import { WarRoomThreadsTable } from "./WarRoomThreadsTable";

// The master agent panel — its floating WindowPanel wrapper plus the whole agent
// execution graph (via AgentConversationColumn). Lazy-load it so neither the
// heavy agent column NOR the window-panel lazy graph (100+ chunks) ships in the
// /war-room/all route bundle — it only loads the first time the user opens the
// panel. MasterAgentWindow owns the static WindowPanel import so the view (which
// lives in the route's boot graph) never trips the window-panels bundle-leak
// guard.
const MasterAgentWindow = dynamic(
  () => import("@/features/war-room/components/master/MasterAgentWindow"),
  { ssr: false, loading: () => null },
);

// The live-watch layer renders thread-agent conversations the master is
// messaging (one WindowPanel per open id). It pulls the agent column graph too,
// so it's lazy-loaded the same way. It self-hides when nothing is being watched
// — but it must always be MOUNTED so a tool/toast `openWatch` can pop a window
// even when the Master panel is closed.
import { MasterWatchLayerDoor as MasterWatchLayer } from "@/features/war-room/components/master/MasterWatchLayerDoor";

type WarRoomAllViewMode = "rooms" | "threads";

export function WarRoomAllView() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const sessions = useAppSelector(selectSessionsList);
  const orphanIds = useAppSelector(selectOrphanThreadIds);
  const status = useAppSelector(selectListStatus);

  const [view, setView] = useState<WarRoomAllViewMode>("rooms");

  // Master Agent panel — local state owns open/closed. Non-modal so the rooms
  // list stays visible and interactive while the user chats with the master.
  const [masterOpen, setMasterOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const [searchQuery, setSearchQuery] = useState("");
  const { roomHits, threadHits, isSearching } =
    useWarRoomAllSearch(searchQuery);

  useEffect(() => {
    if (status === "idle") dispatch(loadSessionsList());
  }, [status, dispatch]);

  // Live-watch windows are ephemeral "this is happening right now" UI tied to
  // this view. Leaving /all unmounts MasterWatchLayer (windows vanish); clear
  // the slice too so returning doesn't re-pop every prior watch window.
  useEffect(() => {
    return () => {
      dispatch(closeAllWatches());
    };
  }, [dispatch]);

  async function handleCreateRoom() {
    if (creating || pending) return;
    setCreating(true);
    const session = await dispatch(createWarRoomSession());
    setCreating(false);
    if (session) {
      startTransition(() => router.push(`/war-room/${session.id}`));
    }
  }

  const headerActions: HeaderAction[] = [
    {
      icon: "Radar",
      label: masterOpen ? "Close Master Agent" : "Master Agent",
      onPress: () => setMasterOpen((v) => !v),
    },
    {
      icon: "FolderKanban",
      label: "From project",
      onPress: () => setProjectDialogOpen(true),
    },
    {
      icon: "Plus",
      label: "New War Room",
      onPress: () => void handleCreateRoom(),
    },
  ];

  const isLoading = status === "loading" || status === "idle";
  const isEmpty =
    status === "ready" && sessions.length === 0 && orphanIds.length === 0;
  const searchEmpty =
    isSearching && roomHits.length === 0 && threadHits.length === 0;
  const filteredRoomIds = new Set(roomHits.map((r) => r.sessionId));
  const visibleSessions = isSearching
    ? sessions.filter((s) => filteredRoomIds.has(s.id))
    : sessions;

  return (
    <>
      <PageHeader>
        <HeaderToggle<WarRoomAllViewMode>
          options={[
            { icon: "LayoutGrid", label: "Rooms", value: "rooms" },
            { icon: "List", label: "Threads", value: "threads" },
          ]}
          active={view}
          onChange={setView}
          actions={headerActions}
        />
      </PageHeader>

      <div className="h-full overflow-hidden flex flex-col bg-textured pt-[var(--shell-header-h)]">
        {view === "threads" ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 max-w-[1600px]">
              <WarRoomThreadsTable isLoading={isLoading} />
            </div>
          </div>
        ) : (
          <>
            {/* Search — war room titles first, thread titles second (results below) */}
            {!isLoading && !isEmpty ? (
              <div className="shrink-0 border-b border-border px-4 sm:px-6 lg:px-8 py-2.5">
                <div className="container mx-auto max-w-[1600px]">
                  <WarRoomSearchField
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search war rooms and threads by title…"
                    ariaLabel="Search war rooms and threads by title"
                    className="w-full max-w-xl"
                    inputClassName="flex-1"
                  />
                </div>
              </div>
            ) : null}

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-5 max-w-[1600px]">
                {isLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <Skeleton key={i} className="h-36 rounded-xl" />
                    ))}
                  </div>
                ) : isEmpty ? (
                  <EmptyState />
                ) : searchEmpty ? (
                  <SearchEmptyState query={searchQuery.trim()} />
                ) : sessions.length === 0 && orphanIds.length > 0 ? (
                  <UnassignedThreadsSection />
                ) : (
                  <div className="space-y-6">
                    {visibleSessions.length > 0 ? (
                      <section>
                        {isSearching ? (
                          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                            War Rooms
                            <span className="ml-1.5 tabular-nums font-medium normal-case tracking-normal">
                              ({visibleSessions.length})
                            </span>
                          </h2>
                        ) : null}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {visibleSessions.map((s) => (
                            <SessionCard key={s.id} session={s} />
                          ))}
                        </div>
                      </section>
                    ) : null}

                    {!isSearching ? <UnassignedThreadsSection /> : null}

                    {isSearching && threadHits.length > 0 ? (
                      <section>
                        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Threads
                          <span className="ml-1.5 tabular-nums font-medium normal-case tracking-normal">
                            ({threadHits.length})
                          </span>
                        </h2>
                        <ul className="space-y-2 max-w-2xl">
                          {threadHits.map((hit) => (
                            <li key={hit.threadId}>
                              <WarRoomThreadHitRow hit={hit} />
                            </li>
                          ))}
                        </ul>
                      </section>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* From-project dialog — trigger lives in the header actions. */}
        <NewRoomFromProjectDialog
          open={projectDialogOpen}
          onOpenChange={setProjectDialogOpen}
        />

        {/* Master Agent — inline, draggable, NON-MODAL WindowPanel. Mounted only
            while open (closing unmounts the heavy agent column). Docked bottom-
            right on first open; the user can drag/resize from there. Inline-
            managed: `onClose` is the required close binding (no overlayId). */}
        {masterOpen && (
          <MasterAgentWindow onClose={() => setMasterOpen(false)} />
        )}

        {/* Live-watch layer — always mounted so a master tool / toast can open a
            watch window for a thread agent even when the Master panel is closed.
            Renders nothing until a conversation is being watched. */}
        <MasterWatchLayer />
      </div>
    </>
  );
}

function SearchEmptyState({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-4">
      <p className="text-sm font-medium text-foreground">No matches</p>
      <p className="mt-1 text-xs text-muted-foreground max-w-md">
        Nothing matched &ldquo;{query}&rdquo;. Try a war room title or thread
        title — search ranks rooms first, then threads across every room.
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-20 px-4">
      <span className="grid place-items-center size-14 mb-4 text-primary">
        <LayoutGrid className="size-7" />
      </span>
      <h2 className="text-lg font-semibold text-foreground">
        No War Rooms yet
      </h2>
      <p className="mt-1.5 text-sm text-muted-foreground max-w-md">
        A War Room gathers every thread you&apos;re juggling — tasks, notes, and
        recordings — into one self-arranging grid you can return to anytime.
      </p>
      <div className="mt-5">
        <NewSessionButton />
      </div>
    </div>
  );
}
