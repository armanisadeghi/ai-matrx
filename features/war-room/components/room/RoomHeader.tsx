"use client";

// features/war-room/components/room/RoomHeader.tsx
//
// Mission control for one War Room, injected into the SHELL header via
// <PageHeader> (core-route-headers conformance — no in-body <header>, no
// avatar-collision padding: controls live in the bounded center zone).
//
//   ← · [icon] Title · live meter ┊ STAGE⇄GRID ┊ search · copy-for-AI ·
//     context chip · Room Agent · ⋯
//
// Secondary room controls (instrument projector, density dial, room details,
// resources, project, delete) collapse into the ONE "⋯" overflow menu; the
// primaries stay inline (Stage⇄Grid, Room Agent, working-context chip). The
// row is its own `@container`, so the label-hiding behavior the old in-body
// header used (@max-xl labels, @2xl meter) keys off the real injected width.
//
// Mobile (<sm): back + title + search + context chip + ONE "⋯" tap target →
// bottom sheet holding everything else (modes, agent, density, projector,
// details, resources, project, delete) — per the core-route-headers mobile
// doctrine. Search and the lens chip stay INLINE rather than moving into the
// sheet: search must show the rail filtering as you type, and the chip is
// rendered at every breakpoint on /chat and opens its own ContextSheet on
// mobile, so sheet-nesting it would stack sheet-on-sheet.
//
// Every control here acts on the WHOLE room (cockpit rule) — the one
// deliberate exception is ActiveContextLensChip, which is global by design.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  Check,
  Circle,
  EyeOff,
  FolderKanban,
  Layers,
  LayoutGrid,
  LayoutPanelLeft,
  Loader2,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Paperclip,
  Pencil,
  Pin,
  Presentation,
  Trash2,
} from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { TapTargetButton } from "@/components/icons/TapTargetButton";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from "@/components/official/bottom-sheet/BottomSheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import { ActiveContextLensChip } from "@/features/scopes/components/active-context/ActiveContextLensChip";
import { useUserProjects } from "@/features/projects/hooks";
import {
  selectContentAssignmentsForRoom,
  selectHiddenThreads,
  selectOrderedGalleryThreadIds,
  selectPinnedThreadCount,
  selectSessionById,
  selectSessionProjectId,
  selectSessionProjectMode,
} from "@/features/war-room/redux/selectors";
import {
  deleteSession,
  renameSession,
} from "@/features/war-room/redux/thunks";
import { reportWarRoomError } from "@/features/war-room/utils/reportWarRoomError";
import type { ThreadTab } from "@/features/war-room/types";
import { EditableTitle } from "../shared/EditableTitle";
import { RoomIdentityEditor } from "./RoomIdentityButton";
import { RoomProjectPickerBody } from "./RoomProjectButton";
import { RoomResourcesSheet } from "./RoomResourcesButton";
import { RoomProjectCopyForAiButton } from "./RoomProjectCopyForAiButton";
import { ThreadSearchBox } from "./ThreadSearchBox";
import { roomColorOf, roomIconOf } from "./roomIdentity";
import { THREAD_KIND_ORDER, threadKindOf } from "./threadKind";
import { useRoomView, type Density, type RoomMode } from "./roomViewContext";

/** Radio sentinel for "no projected tab" — each tile keeps its own view. */
const PROJECT_OWN = "__own__";

export function RoomHeader({
  sessionId,
  ready,
  roomAgentOpen,
  onToggleRoomAgent,
}: {
  sessionId: string;
  ready: boolean;
  roomAgentOpen: boolean;
  onToggleRoomAgent: () => void;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const session = useAppSelector(selectSessionById(sessionId));
  const {
    mode,
    setMode,
    projectedTab,
    setProjectedTab,
    density,
    setDensity,
    threadDetailOpen,
  } = useRoomView();

  // Overflow-launched surfaces — controlled so both the desktop "⋯" menu and
  // the mobile sheet can open the SAME popover/sheet primitives the old
  // header buttons owned (re-housed, not rewritten).
  const [sheetOpen, setSheetOpen] = useState(false);
  const [identityOpen, setIdentityOpen] = useState(false);
  const [projectOpen, setProjectOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);

  const roomProjectId = useAppSelector(selectSessionProjectId(sessionId));
  const projectMode = useAppSelector(selectSessionProjectMode(sessionId));
  const resourceCount = useAppSelector(
    selectContentAssignmentsForRoom(sessionId),
  ).length;
  const { projects } = useUserProjects();
  const roomProjectName =
    (roomProjectId && projects.find((p) => p.id === roomProjectId)?.name) ||
    null;

  const [deletePending, startDeleteTransition] = useTransition();

  const RoomIcon = roomIconOf(session?.icon);
  const roomColor = roomColorOf(session?.color);

  async function handleDeleteRoom() {
    if (deletePending || !session) return; // guard duplicate clicks
    const ok = await confirm({
      title: "Delete this War Room?",
      description: `"${session.title}" and its tile layout will be removed. The tasks, notes, and transcripts inside stay safe.`,
      variant: "destructive",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    startDeleteTransition(async () => {
      try {
        await dispatch(deleteSession(sessionId));
        router.push("/war-room/all");
      } catch (err) {
        reportWarRoomError("RoomHeader.delete", err);
      }
    });
  }

  // Radix dropdown restores focus to its trigger as it closes; defer the
  // controlled-popover open one tick so the two don't fight over focus.
  function openAfterMenu(open: (v: boolean) => void) {
    setTimeout(() => open(true), 0);
  }

  // A selected thread owns the route surface (and brings its own chrome) —
  // the room header steps aside entirely, same as the old `hidden` toggle.
  if (threadDetailOpen) return null;

  return (
    <>
      <PageHeader>
        <div className="@container flex w-full min-w-0 items-center gap-1.5">
          <ChevronLeftTapButton href="/war-room/all" ariaLabel="Back" />
          {/* Decorative identity mark — hidden on a phone-width header so the
              TITLE (which actually names the room) keeps the space. */}
          <span
            className={cn(
              "hidden sm:grid place-items-center size-7 shrink-0 rounded-lg",
              roomColor.tint,
              roomColor.text,
            )}
          >
            <RoomIcon className="size-4" />
          </span>

          {session ? (
            <span className="min-w-0 overflow-hidden">
              <EditableTitle
                value={session.title}
                onSave={(next) => dispatch(renameSession(sessionId, next))}
                placeholder="Untitled War Room"
                className="text-sm font-semibold max-w-[24ch]"
                inputClassName="text-sm font-semibold"
              />
            </span>
          ) : (
            <h1 className="text-sm font-semibold text-foreground truncate">
              War Room
            </h1>
          )}

          {session && ready ? <LiveMeter sessionId={sessionId} /> : null}

          <div className="flex-1 min-w-1" />

          {session ? (
            <div className="hidden sm:block shrink-0">
              <ModeSwitch />
            </div>
          ) : null}

          <div className="flex-1 min-w-1" />

          {session ? (
            <>
              {/* Primaries that stay inline at EVERY width. Each one is either
                  useless in a sheet (search — you must see the rail filter as
                  you type) or already mobile-aware and canonical elsewhere
                  (the lens chip renders at all breakpoints on /chat and opens
                  its own ContextSheet on mobile, so nesting it in our sheet
                  would stack sheet-on-sheet). Copy-for-AI only renders when
                  the room has a project. */}
              <div className="flex min-w-0 items-center gap-1.5">
                {ready ? <ThreadSearchBox /> : null}
                <RoomProjectCopyForAiButton sessionId={sessionId} />
                {/* Same working-context control as /chat — writes
                    appContextSlice (Surface A). Global by design. */}
                <ActiveContextLensChip align="end" className="min-w-0" />
              </div>

              {/* Desktop-only: everything else lives in the "⋯" menu. */}
              <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                <RoomAgentToggle
                  open={roomAgentOpen}
                  onToggle={onToggleRoomAgent}
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <TapTargetButton
                      icon={<MoreHorizontal className="h-4 w-4" />}
                      ariaLabel="War Room options"
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60">
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Presentation className="size-3.5 mr-2 text-muted-foreground" />
                        Project all to one view
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup
                          value={projectedTab ?? PROJECT_OWN}
                          onValueChange={(v) =>
                            setProjectedTab(
                              v === PROJECT_OWN ? null : (v as ThreadTab),
                            )
                          }
                        >
                          <DropdownMenuRadioItem value={PROJECT_OWN}>
                            <Layers className="size-3.5 mr-2 text-muted-foreground" />
                            Each thread&apos;s own view
                          </DropdownMenuRadioItem>
                          {THREAD_KIND_ORDER.map((id) => {
                            const k = threadKindOf(id);
                            return (
                              <DropdownMenuRadioItem key={id} value={id}>
                                <k.Icon className={cn("size-3.5 mr-2", k.text)} />
                                {k.label}
                              </DropdownMenuRadioItem>
                            );
                          })}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <Minimize2 className="size-3.5 mr-2 text-muted-foreground" />
                        Tile density
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup
                          value={density}
                          onValueChange={(v) => setDensity(v as Density)}
                        >
                          <DropdownMenuRadioItem value="comfortable">
                            <Maximize2 className="size-3.5 mr-2 text-muted-foreground" />
                            Comfortable
                          </DropdownMenuRadioItem>
                          <DropdownMenuRadioItem value="compact">
                            <Minimize2 className="size-3.5 mr-2 text-muted-foreground" />
                            Compact
                          </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() => openAfterMenu(setIdentityOpen)}
                    >
                      <Pencil className="size-3.5 mr-2 text-muted-foreground" />
                      Room details…
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => openAfterMenu(setResourcesOpen)}
                    >
                      <Paperclip className="size-3.5 mr-2 text-muted-foreground" />
                      Room resources…
                      {resourceCount > 0 ? (
                        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                          {resourceCount}
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => openAfterMenu(setProjectOpen)}
                    >
                      <FolderKanban className="size-3.5 mr-2 text-muted-foreground" />
                      <span className="truncate">
                        {projectMode === "room" && roomProjectName
                          ? `Project: ${roomProjectName}`
                          : projectMode === "per-thread"
                            ? "Project: per-thread"
                            : "Link a project…"}
                      </span>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      disabled={deletePending}
                      onSelect={(e) => {
                        // Keep the menu's selection from closing before confirm
                        // runs; the handler owns the async flow + click guard.
                        e.preventDefault();
                        void handleDeleteRoom();
                      }}
                    >
                      {deletePending ? (
                        <Loader2 className="size-3.5 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="size-3.5 mr-2" />
                      )}
                      Delete War Room
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Mobile — ONE trigger; everything lives in the bottom sheet. */}
              <div className="sm:hidden shrink-0">
                <TapTargetButton
                  icon={<MoreHorizontal className="h-4 w-4" />}
                  ariaLabel="War Room options"
                  onClick={() => setSheetOpen(true)}
                />
              </div>

              {/* Zero-size anchors for the overflow-launched popovers — the
                  content aligns to the end of the header row on any viewport. */}
              <Popover open={identityOpen} onOpenChange={setIdentityOpen}>
                <PopoverAnchor className="size-0" />
                <PopoverContent className="w-80" align="end">
                  <RoomIdentityEditor
                    sessionId={sessionId}
                    title={session.title}
                    description={session.description}
                    iconName={session.icon}
                    colorToken={roomColor.id}
                  />
                </PopoverContent>
              </Popover>
              <Popover open={projectOpen} onOpenChange={setProjectOpen}>
                <PopoverAnchor className="size-0" />
                <PopoverContent className="w-72" align="end">
                  <RoomProjectPickerBody
                    sessionId={sessionId}
                    roomProjectId={roomProjectId}
                    mode={projectMode}
                  />
                </PopoverContent>
              </Popover>
            </>
          ) : null}
        </div>
      </PageHeader>

      {/* Resources — Sheet on desktop, Drawer on mobile (self-selecting). */}
      {session && resourcesOpen ? (
        <RoomResourcesSheet
          sessionId={sessionId}
          open={resourcesOpen}
          onOpenChange={setResourcesOpen}
        />
      ) : null}

      {/* Mobile bottom sheet — modes AND actions, per the mobile doctrine. */}
      {session ? (
        <BottomSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          title="War Room options"
        >
          <BottomSheetHeader
            title={session.title || "War Room"}
            trailing={
              <button
                onClick={() => setSheetOpen(false)}
                className="text-primary active:opacity-70 min-h-[44px] px-1 text-[15px]"
              >
                Done
              </button>
            }
          />
          <BottomSheetBody>
            <SheetRow
              Icon={LayoutPanelLeft}
              label="Stage view"
              active={mode === "stage"}
              onPress={() => {
                setMode("stage" satisfies RoomMode);
                setSheetOpen(false);
              }}
            />
            <SheetRow
              Icon={LayoutGrid}
              label="Grid view"
              active={mode === "grid"}
              onPress={() => {
                setMode("grid" satisfies RoomMode);
                setSheetOpen(false);
              }}
            />
            <SheetRow
              Icon={Bot}
              label={roomAgentOpen ? "Close Room Agent" : "Room Agent"}
              active={roomAgentOpen}
              onPress={() => {
                onToggleRoomAgent();
                setSheetOpen(false);
              }}
            />
            <SheetRow
              Icon={density === "compact" ? Minimize2 : Maximize2}
              label="Compact tiles"
              active={density === "compact"}
              onPress={() =>
                setDensity(density === "compact" ? "comfortable" : "compact")
              }
            />
            <p className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Project all to one view
            </p>
            <SheetRow
              Icon={Layers}
              label="Each thread's own view"
              active={projectedTab === null}
              onPress={() => setProjectedTab(null)}
            />
            {THREAD_KIND_ORDER.map((id) => {
              const k = threadKindOf(id);
              return (
                <SheetRow
                  key={id}
                  Icon={k.Icon}
                  label={k.label}
                  active={projectedTab === id}
                  onPress={() => setProjectedTab(id)}
                />
              );
            })}
            <p className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Room
            </p>
            <SheetRow
              Icon={Pencil}
              label="Room details…"
              onPress={() => {
                setSheetOpen(false);
                setIdentityOpen(true);
              }}
            />
            <SheetRow
              Icon={Paperclip}
              label={
                resourceCount > 0
                  ? `Room resources (${resourceCount})`
                  : "Room resources"
              }
              onPress={() => {
                setSheetOpen(false);
                setResourcesOpen(true);
              }}
            />
            <SheetRow
              Icon={FolderKanban}
              label={
                projectMode === "room" && roomProjectName
                  ? `Project: ${roomProjectName}`
                  : projectMode === "per-thread"
                    ? "Project: per-thread"
                    : "Link a project…"
              }
              onPress={() => {
                setSheetOpen(false);
                setProjectOpen(true);
              }}
            />
            <SheetRow
              Icon={Trash2}
              label="Delete War Room"
              destructive
              onPress={() => {
                setSheetOpen(false);
                void handleDeleteRoom();
              }}
            />
          </BottomSheetBody>
        </BottomSheet>
      ) : null}
    </>
  );
}

// ── Room Agent toggle — the room-wide agent, active state visible ───────────
function RoomAgentToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={open}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 h-7 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        open
          ? "text-primary border border-primary/70"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-accent",
      )}
      title="Chat with an agent that sees every thread in this room"
    >
      <Bot className="size-3.5 shrink-0" />
      <span className="@max-2xl:hidden">Room Agent</span>
    </button>
  );
}

// ── Live meter — active / parked / pinned, straight from Redux ──────────────
function LiveMeter({ sessionId }: { sessionId: string }) {
  const visibleIds = useAppSelector(selectOrderedGalleryThreadIds(sessionId));
  const hidden = useAppSelector(selectHiddenThreads(sessionId));
  const pinnedCount = useAppSelector(selectPinnedThreadCount(sessionId));
  return (
    <div className="hidden @3xl:flex items-center gap-2 pl-2 ml-0.5 border-l border-border/60 text-[11px] tabular-nums text-muted-foreground shrink-0">
      <span
        className="inline-flex items-center gap-1"
        title={`${visibleIds.length} active thread${visibleIds.length === 1 ? "" : "s"}`}
      >
        <Circle className="size-2.5 fill-success text-success" />
        {visibleIds.length} active
      </span>
      {pinnedCount > 0 ? (
        <span
          className="inline-flex items-center gap-0.5 text-primary"
          title="Pinned threads"
        >
          <Pin className="size-3" />
          {pinnedCount}
        </span>
      ) : null}
      {hidden.length > 0 ? (
        <span
          className="inline-flex items-center gap-0.5"
          title={`${hidden.length} parked thread${hidden.length === 1 ? "" : "s"}`}
        >
          <EyeOff className="size-3" />
          {hidden.length} stowed
        </span>
      ) : null}
    </div>
  );
}

// ── Stage ⇄ Grid switch (reimagine) — the room's ONE primary mode control ───
function ModeSwitch() {
  const { mode, setMode } = useRoomView();
  const items: { id: RoomMode; label: string; Icon: typeof LayoutGrid }[] = [
    { id: "stage", label: "Stage", Icon: LayoutPanelLeft },
    { id: "grid", label: "Grid", Icon: LayoutGrid },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/60 p-0.5">
      {items.map(({ id, label, Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            aria-pressed={active}
            title={`${label} view`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md h-7 px-2 text-xs font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              active
                ? "bg-card text-primary shadow-[var(--elevation-1)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            <span className="@max-2xl:hidden">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── Bottom-sheet action row (mobile) ────────────────────────────────────────
function SheetRow({
  Icon,
  label,
  active,
  destructive,
  onPress,
}: {
  Icon: typeof LayoutGrid;
  label: string;
  active?: boolean;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        "flex items-center w-full px-5 min-h-[52px] active:bg-white/5 transition-colors border-b border-white/[0.06] last:border-0",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4 mr-3 shrink-0",
          destructive
            ? "text-destructive"
            : active
              ? "text-primary"
              : "text-muted-foreground",
        )}
      />
      <span className={cn("text-[15px] flex-1 text-left", active && "font-medium")}>
        {label}
      </span>
      {active ? <Check className="w-4 h-4 text-primary shrink-0" /> : null}
    </button>
  );
}
