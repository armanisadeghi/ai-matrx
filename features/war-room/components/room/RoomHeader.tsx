"use client";

// features/war-room/components/room/RoomHeader.tsx
//
// Mission control for one War Room, on the shell's shared RouteHeader:
//
//   [← · icon · Title · live meter] ┊ Stage⇄Grid⇄Board ┊ copy · copy-for-AI ·
//     context chip · search · Room Agent · ⋯
//
// RouteHeader measures the MAIN COLUMN (the canvas and the chat panel narrow
// it): actions fold into "…" lowest priority first, the ⋯ menu stays, and the
// mode switch steps down full → icons → one trigger. Secondary room controls
// (projector, density, details, resources, project, delete) live in the ⋯.
//
// Phone: back + title + search in the row; everything else is drawn straight
// into the shell's ⋮ sheet ("This page") — modes and room actions as rows.
//
// Every control here acts on the WHOLE room (cockpit rule) — the one
// deliberate exception is ActiveContextLensChip, which is global by design.

import { createElement, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Circle,
  EyeOff,
  FolderKanban,
  Frame,
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
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { useCenterControlFit } from "@/features/shell/components/header/useCenterControlFit";
import { usePhonePageActions } from "@/features/shell/components/header/phone-page-actions";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { ChevronLeftTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import { TapTargetButton } from "@ai-matrx/design-system/tap-target";
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from "@ai-matrx/design-system";
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
} from "@ai-matrx/design-system";
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
import { deleteSession, renameSession } from "@/features/war-room/redux/thunks";
import { reportWarRoomError } from "@/features/war-room/utils/reportWarRoomError";
import type { ThreadTab } from "@/features/war-room/types";
import { EditableTitle } from "../shared/EditableTitle";
import { RoomIdentityEditor } from "./RoomIdentityButton";
import { RoomProjectPickerBody } from "./RoomProjectButton";
import { useOptionalCanvas } from "@ai-matrx/canvas/react";
import { openToolInCanvas } from "@/features/canvas/host/toolCanvas";
import { roomResourcesOpenInput } from "@/features/war-room/canvas/warRoomResourcesKind";
import { RoomProjectCopyForAiButton } from "./RoomProjectCopyForAiButton";
import { RoomCopyControls } from "./RoomCopyControls";
import { ThreadSearchBox } from "./ThreadSearchBox";
import { roomColorOf, roomIconOf } from "./roomIdentity";
import { THREAD_KIND_ORDER, threadKindOf } from "./threadKind";
import { useRoomView, type Density, type RoomMode } from "./roomViewContext";
import { AGENT_ICON } from "@/components/icons/domain-icons";

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
  const isPhone = useIsMobile();
  const { host: phoneSheetHost } = usePhonePageActions();
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
  // Room resources open as the room's canvas tab, beside the room.
  const canvas = useOptionalCanvas();
  const openRoomResources = () => void openToolInCanvas(canvas, roomResourcesOpenInput(sessionId, session?.title));

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

  const roomIcon = createElement(roomIconOf(session?.icon), {
    className: "size-4",
  });
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

  // The room's modes and actions — ONE list: the room's own sheet draws it,
  // and on a phone it is drawn directly in the shell's ⋮ ("This page"), so
  // everything is one step (page-pass shared defects, 2026-09-27).
  const sheetRows = (
    <>
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
        Icon={AGENT_ICON}
        label={roomAgentOpen ? "Close Room Agent" : "Room Agent"}
        active={roomAgentOpen}
        onPress={() => {
          onToggleRoomAgent();
          setSheetOpen(false);
        }}
      />
      <SheetRow
        Icon={Frame}
        label="Board view"
        active={mode === "board"}
        onPress={() => {
          setMode("board" satisfies RoomMode);
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
          openRoomResources();
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
    </>
  );
  const inShellSheet = isPhone && phoneSheetHost != null;

  // A selected thread owns the route surface (and brings its own chrome) —
  // the room header steps aside entirely, same as the old `hidden` toggle.
  if (threadDetailOpen) return null;

  const projectLabel =
    projectMode === "room" && roomProjectName
      ? `Project: ${roomProjectName}`
      : projectMode === "per-thread"
        ? "Project: per-thread"
        : "Link a project…";

  // ON THE SHARED ROUTE HEADER (2026-10-03). This row was a hand-built flex
  // row whose right side could only squeeze and whose labels hid by a
  // breakpoint — with the canvas open (main column ~500px) the title ran under
  // Stage · Grid · Board and showed "Ac". RouteHeader measures the MAIN
  // COLUMN: actions fold into "…" lowest priority first, the mode switch steps
  // down full → icons → one trigger (useCenterControlFit), and on a phone the
  // actions move into the shell's ⋮ sheet.
  const right = !session ? null : inShellSheet ? (
    <>
      {/* On a phone the room's rows are drawn straight into the shell's ⋮
          ("This page"): modes, agent, density, projector, room actions. */}
      <div className="flex w-full flex-col" data-war-room-sheet-rows>
        {sheetRows}
      </div>
      {ready ? <RoomCopyControls sessionId={sessionId} /> : null}
      <RoomProjectCopyForAiButton sessionId={sessionId} />
      <ActiveContextLensChip align="end" className="min-w-0" />
      {/* The phone row keeps search: the rail must filter as you type. */}
      {ready ? <ThreadSearchBox /> : null}
    </>
  ) : (
    <>
      {ready ? <RoomCopyControls sessionId={sessionId} /> : null}
      <RoomProjectCopyForAiButton sessionId={sessionId} />
      {/* Same working-context control as /chat — writes appContextSlice
          (Surface A). Global by design. */}
      <ActiveContextLensChip align="end" className="min-w-0" />
      {ready ? <ThreadSearchBox /> : null}
      <RoomAgentToggle open={roomAgentOpen} onToggle={onToggleRoomAgent} />
      {isPhone ? (
        <TapTargetButton
          icon={<MoreHorizontal className="h-4 w-4" />}
          ariaLabel="War Room options"
          onClick={() => setSheetOpen(true)}
        />
      ) : (
        <RoomOptionsMenu
          mode={mode}
          setMode={setMode}
          projectedTab={projectedTab}
          setProjectedTab={setProjectedTab}
          density={density}
          setDensity={setDensity}
          resourceCount={resourceCount}
          projectLabel={projectLabel}
          deletePending={deletePending}
          onIdentity={() => openAfterMenu(setIdentityOpen)}
          onResources={openRoomResources}
          onProject={() => openAfterMenu(setProjectOpen)}
          onDelete={() => void handleDeleteRoom()}
        />
      )}
    </>
  );

  return (
    <>
      <RouteHeader
        left={
          // ALL GLASS OR NONE (tap-target placement rule 2): the back button
          // and the room's identity share ONE glass capsule instead of a
          // glass circle beside bare text. The back button is the group
          // variant (its pill inset in the capsule), so the title adds the
          // half-gap on the side facing it (rule 3).
          <div
            data-matrx-glass
            className="matrx-glass-thin-border flex h-[var(--matrx-tap-wide-size)] min-w-[var(--matrx-tap-wide-size)] items-center rounded-full"
          >
            <ChevronLeftTapButton variant="group" href="/war-room/all" ariaLabel="Back" />
            <div data-matrx-glass className="flex min-w-0 items-center gap-1.5 ps-1 pe-2">
              {/* The room's mark opens its details (icon, color, purpose).
                  Drawn only when the header's own row is roomy, so on a
                  phone or beside the canvas the TITLE keeps the space. */}
              <button
                type="button"
                onClick={() => setIdentityOpen(true)}
                disabled={!session}
                aria-label="Room details"
                title="Room details"
                className={cn(
                  "hidden @min-[36rem]/shell-header:grid place-items-center size-6 shrink-0 rounded-md transition-opacity hover:opacity-80",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                  roomColor.tint,
                  roomColor.text,
                )}
              >
                {roomIcon}
              </button>
              {session ? (
                <EditableTitle
                  value={session.title}
                  onSave={(next) => dispatch(renameSession(sessionId, next))}
                  placeholder="Untitled War Room"
                  className="text-sm font-semibold"
                  inputClassName="text-sm font-semibold"
                />
              ) : (
                <h1 className="truncate text-sm font-semibold text-foreground">War Room</h1>
              )}
              {session && ready ? <LiveMeter sessionId={sessionId} /> : null}
            </div>
          </div>
        }
        center={session && !inShellSheet ? <ModeSwitch /> : undefined}
        right={right}
      />

      {session ? (
        <>
          {/* Zero-size anchors for the overflow-launched popovers, pinned
              under the header's end edge on any viewport. */}
          <Popover open={identityOpen} onOpenChange={setIdentityOpen}>
            <PopoverAnchor className="fixed right-4 top-[var(--shell-header-h)] size-0" />
            <PopoverContent sizing="content" align="end">
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
            <PopoverAnchor className="fixed right-4 top-[var(--shell-header-h)] size-0" />
            <PopoverContent sizing="content" align="end">
              <RoomProjectPickerBody
                sessionId={sessionId}
                roomProjectId={roomProjectId}
                mode={projectMode}
              />
            </PopoverContent>
          </Popover>
        </>
      ) : null}

      {/* Phone without the shell's ⋮ — the room's own bottom sheet. */}
      {session && !inShellSheet ? (
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
          <BottomSheetBody>{sheetRows}</BottomSheetBody>
        </BottomSheet>
      ) : null}
    </>
  );
}

// ── The room's "⋯" menu (desktop) — everything that is not a primary ────────
function RoomOptionsMenu({
  mode,
  setMode,
  projectedTab,
  setProjectedTab,
  density,
  setDensity,
  resourceCount,
  projectLabel,
  deletePending,
  onIdentity,
  onResources,
  onProject,
  onDelete,
}: {
  mode: RoomMode;
  setMode: (mode: RoomMode) => void;
  projectedTab: ThreadTab | null;
  setProjectedTab: (tab: ThreadTab | null) => void;
  density: Density;
  setDensity: (d: Density) => void;
  resourceCount: number;
  projectLabel: string;
  deletePending: boolean;
  onIdentity: () => void;
  onResources: () => void;
  onProject: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TapTargetButton
          icon={<MoreHorizontal className="h-4 w-4" />}
          ariaLabel="War Room options"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {/* The room's view, always reachable here too — on a narrow column
            the header's switch can have no room to draw at all. */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <LayoutPanelLeft className="size-3.5 mr-2 text-muted-foreground" />
            Room view
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={mode}
              onValueChange={(v) => {
                const next = MODE_ITEMS.find((m) => m.id === v);
                if (next) setMode(next.id);
              }}
            >
              {MODE_ITEMS.map(({ id, label, Icon }) => (
                <DropdownMenuRadioItem key={id} value={id}>
                  <Icon className="size-3.5 mr-2 text-muted-foreground" />
                  {label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Presentation className="size-3.5 mr-2 text-muted-foreground" />
            Project all to one view
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={projectedTab ?? PROJECT_OWN}
              onValueChange={(v) =>
                setProjectedTab(v === PROJECT_OWN ? null : (v as ThreadTab))
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
        <DropdownMenuItem onSelect={onIdentity}>
          <Pencil className="size-3.5 mr-2 text-muted-foreground" />
          Room details…
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onResources}>
          <Paperclip className="size-3.5 mr-2 text-muted-foreground" />
          Room resources…
          {resourceCount > 0 ? (
            <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
              {resourceCount}
            </span>
          ) : null}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onProject}>
          <FolderKanban className="size-3.5 mr-2 text-muted-foreground" />
          <span className="truncate">{projectLabel}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={deletePending}
          onSelect={(e) => {
            // Keep the menu's selection from closing before confirm runs; the
            // handler owns the async flow + click guard.
            e.preventDefault();
            onDelete();
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
  );
}
// A page's own menu: on a phone it is never the row's primary (RouteHeader).
RoomOptionsMenu.routeHeaderMenu = true as const;

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
      <AGENT_ICON className="size-3.5 shrink-0" />
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
    <div className="hidden @3xl/shell-header:flex items-center gap-2 pl-2 ml-0.5 border-l border-border/60 text-[11px] tabular-nums text-muted-foreground shrink-0">
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

// ── Stage ⇄ Grid ⇄ Board switch (reimagine) — the room's ONE primary mode control ───
// MEASURED on the header's own row (useCenterControlFit), never read from a
// breakpoint: full (icon + label) → icons → one trigger naming the mode.
const MODE_ITEMS: { id: RoomMode; label: string; Icon: typeof LayoutGrid }[] = [
  { id: "stage", label: "Stage", Icon: LayoutPanelLeft },
  { id: "grid", label: "Grid", Icon: LayoutGrid },
  { id: "board", label: "Board", Icon: Frame },
];
const noopSubscribe = () => () => {};

function ModeSwitch() {
  const { mode, setMode } = useRoomView();
  const cellRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const iconsRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const fit = useCenterControlFit(cellRef, [fullRef, iconsRef, triggerRef], mode);
  // False in the server HTML and during hydration; measured before the first
  // client paint after that.
  const measured = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const active = MODE_ITEMS.find((m) => m.id === mode) ?? MODE_ITEMS[0]!;

  const segments = (withLabels: boolean, interactive: boolean) => (
    <div
      role={interactive ? "group" : undefined}
      aria-label={interactive ? "Room view" : undefined}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-muted/60 p-0.5",
        !interactive && "w-max max-w-none",
      )}
    >
      {MODE_ITEMS.map(({ id, label, Icon }) => {
        const on = mode === id;
        return (
          <button
            key={id}
            type="button"
            onClick={interactive ? () => setMode(id) : undefined}
            tabIndex={interactive ? undefined : -1}
            aria-pressed={interactive ? on : undefined}
            aria-label={withLabels ? undefined : `${label} view`}
            title={`${label} view`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md h-7 px-2 text-xs font-medium whitespace-nowrap transition-all",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
              on
                ? "bg-card text-primary shadow-[var(--elevation-1)]"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {withLabels ? <span>{label}</span> : null}
          </button>
        );
      })}
    </div>
  );
  const triggerClass =
    "inline-flex h-7 shrink-0 items-center gap-1 rounded-lg bg-muted/60 px-2 text-xs font-medium text-primary";
  const triggerFace = (
    <>
      <active.Icon className="size-3.5" />
      <ChevronDown className="size-3 text-muted-foreground" aria-hidden="true" />
    </>
  );

  return (
    <div
      ref={cellRef}
      className="relative flex w-full min-w-0 justify-center"
      data-route-nav-inflow={fit.inflow ? "" : undefined}
    >
      {/* Hidden measurers at natural width (`w-max max-w-none`: the global
          `* { max-width: 100% }` would cap them at this cell). */}
      <div aria-hidden className="pointer-events-none invisible absolute left-0 top-0">
        <div ref={fullRef} className="w-max max-w-none">{segments(true, false)}</div>
        <div ref={iconsRef} className="w-max max-w-none">{segments(false, false)}</div>
        <span ref={triggerRef} data-route-nav-min className={cn(triggerClass, "w-max max-w-none")}>
          {triggerFace}
        </span>
      </div>
      {!measured || fit.index === 0 ? segments(true, true) : null}
      {measured && fit.index === 1 ? segments(false, true) : null}
      {measured && fit.index === 2 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Room view: ${active.label}`}
              title={`${active.label} view`}
              className={triggerClass}
            >
              {triggerFace}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuRadioGroup
              value={mode}
              onValueChange={(v) => {
                const next = MODE_ITEMS.find((m) => m.id === v);
                if (next) setMode(next.id);
              }}
            >
              {MODE_ITEMS.map(({ id, label, Icon }) => (
                <DropdownMenuRadioItem key={id} value={id}>
                  <Icon className="size-3.5 mr-2 text-muted-foreground" />
                  {label} view
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
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
        "flex items-center gap-3 w-full px-5 min-h-[52px] active:bg-accent/50 transition-colors border-b border-border last:border-0",
        destructive ? "text-destructive" : "text-foreground",
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4 shrink-0",
          destructive
            ? "text-destructive"
            : active
              ? "text-primary"
              : "text-muted-foreground",
        )}
      />
      <span
        className={cn("text-[15px] flex-1 text-left", active && "font-medium")}
      >
        {label}
      </span>
      {active ? <Check className="w-4 h-4 text-primary shrink-0" /> : null}
    </button>
  );
}
