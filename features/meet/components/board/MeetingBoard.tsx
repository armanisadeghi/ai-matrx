"use client";

/**
 * MeetingBoard — the meeting as a BOARD instead of a wall of faces.
 *
 * The spatial board (features/spatial — consumed, never forked) fills the
 * stage. It opens on a "Meeting notes" frame whose tiles are live from the
 * package's AI seam (transcript, notes, decisions, action items, summary), and
 * the person can put anything else beside it — a web page, an image, a
 * scratchpad, even things unrelated to the meeting — then zoom in and out of
 * all of it. People float in a draggable strip in screen space.
 *
 * ZERO WRAPPERS (features/meet/FEATURE.md): everything that is the meeting is
 * the package's exported piece, composed — `ConsentNotice`, `AttendanceNotice`
 * and `RecordingIndicator` render for every participant exactly as the
 * package ships them, the faces are `ParticipantTile`, captions are `Captions`,
 * and the bottom is the package's `ControlBar` (its chat, people and Meeting
 * assistant panels included). The root carries the package's `mx-meet` class
 * so those pieces sit in the structure and tokens they were built for.
 *
 * What the board holds is per viewer and per meeting, kept in this browser
 * (a convenience: blocked storage just means the default board).
 */

import { useEffect, useState, type ReactNode } from "react";
import {
  Code2,
  FileText,
  Globe,
  Image as ImageIcon,
  ListChecks,
  Lock,
  MessageSquareText,
  NotebookPen,
  Plus,
  Scale,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import {
  AttendanceNotice,
  Captions,
  ConsentNotice,
  ControlBar,
  HostMenu,
  RecordingIndicator,
  participantSummary,
  useElapsed,
  useIsHost,
  useMeetSnapshot,
  type MeetingRecord,
} from "@ai-matrx/meet/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { type Rect, screenToWorld } from "@/features/spatial/engine/camera";
import { useEditingTile } from "@/features/spatial/engine/react";
import type { SpatialStore } from "@/features/spatial/engine/spatial-store";
import { DEFAULT_THROW_ACTIONS, type ThrowDirection } from "@/features/spatial/engine/throw";
import { useBoard, type BoardFrame } from "@/features/spatial/board/useBoard";
import { SpatialBoardMenu } from "@/features/spatial/components/SpatialBoardMenu";
import { ParkedShelf } from "@/features/spatial/components/ParkedShelf";
import { SpatialViewport } from "@/features/spatial/components/SpatialViewport";
import { SpatialTile } from "@/features/spatial/components/SpatialTile";
import { SpatialFrame } from "@/features/spatial/components/SpatialFrame";
import { SpatialEdge } from "@/features/spatial/components/SpatialEdge";
import { SpatialBoardSurface } from "@/features/spatial/components/SpatialBoardSurface";
import type { AddTileInput, BoardToolHost, EditTileInput } from "@/features/spatial/tools/useBoardAgentTools";
import { MarkdownTileBody } from "@/features/spatial/tiles/MarkdownTileBody";
import { Minimap, ZoomHud } from "@/features/spatial/components/SpatialChrome";
import { ReplayStream } from "@/features/spatial/streams/stream-source";
import { StreamTileBody } from "@/features/spatial/tiles/StreamTileBody";
import { HtmlTileBody, ImageTileBody } from "@/features/spatial/tiles/MediaTileBodies";
import { RESEARCH_REPORT } from "@/features/spatial/demo/demo-content";
import { LayoutSwitch, type MeetingLayoutChoice } from "./LayoutSwitch";
import { PeopleStrip } from "./PeopleStrip";
import {
  MeetingSectionBody,
  useMeetingSectionStatus,
  type MeetingSection,
} from "./MeetingNotesBodies";
import { useWheelModePreference } from "@/features/spatial/board/useWheelModePreference";

// ── the board's tiles ────────────────────────────────────────────────────────

type TileContent =
  | { type: "meeting"; section: MeetingSection }
  /** A page by address (`src`) or one an agent wrote (`srcDoc`). */
  | { type: "html"; src?: string; srcDoc?: string }
  | { type: "image"; src: string }
  | { type: "replay" }
  /** `text` absent only on a scratchpad saved before its text lived on the tile. */
  | { type: "scratch"; text?: string }
  /** An agent's write-up, rendered through the stream pipeline. */
  | { type: "markdown"; text: string };

interface BoardSpec {
  id: string;
  rect: Rect;
  title: string;
  subtitle: string;
  content: TileContent;
}

const PAD = 48;
const GAP = 40;
const COL_W = 520;
const CELL_H = 390;
const TRANSCRIPT_W = 560;

const MEETING_TILES: BoardSpec[] = [
  meetingTile("transcript", "Transcript", { x: PAD, y: PAD, w: TRANSCRIPT_W, h: CELL_H * 2 + GAP }),
  meetingTile("notes", "Notes", { x: PAD + TRANSCRIPT_W + GAP, y: PAD, w: COL_W, h: CELL_H }),
  meetingTile("decisions", "Decisions", {
    x: PAD + TRANSCRIPT_W + GAP * 2 + COL_W,
    y: PAD,
    w: COL_W,
    h: CELL_H,
  }),
  meetingTile("actions", "Action items", {
    x: PAD + TRANSCRIPT_W + GAP,
    y: PAD + CELL_H + GAP,
    w: COL_W,
    h: CELL_H,
  }),
  meetingTile("summary", "Summary", {
    x: PAD + TRANSCRIPT_W + GAP * 2 + COL_W,
    y: PAD + CELL_H + GAP,
    w: COL_W,
    h: CELL_H,
  }),
];

const NOTES_FRAME = {
  id: "meeting-notes",
  rect: {
    x: 0,
    y: 0,
    w: PAD * 2 + TRANSCRIPT_W + GAP * 2 + COL_W * 2,
    h: PAD * 2 + CELL_H * 2 + GAP,
  },
  title: "Meeting notes",
  note: "Live from the meeting assistant",
};

function meetingTile(section: MeetingSection, title: string, rect: Rect): BoardSpec {
  return { id: `meeting:${section}`, rect, title, subtitle: "Live · this meeting", content: { type: "meeting", section } };
}

const SECTION_ICON: Record<MeetingSection, LucideIcon> = {
  transcript: MessageSquareText,
  notes: NotebookPen,
  decisions: Scale,
  actions: ListChecks,
  summary: FileText,
};

function iconOf(content: TileContent): LucideIcon {
  switch (content.type) {
    case "meeting":
      return SECTION_ICON[content.section];
    case "html":
      return !content.src || content.src.startsWith("/samples/") ? Code2 : Globe;
    case "image":
      return ImageIcon;
    case "replay":
    case "markdown":
      return FileText;
    case "scratch":
      return StickyNote;
  }
}

const SAMPLE_PAGES = [
  { src: "/samples/ai-matrx-animations.html", title: "Animation study" },
  { src: "/samples/ai-matrx-industries-v2.html", title: "Industries page" },
  { src: "/samples/ai-matrx-vector-variations.html", title: "Vector variations" },
];

// ── per-viewer persistence (this browser only) ───────────────────────────────

const boardKey = (meetingId: string) => `matrx.meet.board.${meetingId}`;
const scratchKey = (meetingId: string, id: string) => `matrx.meet.scratch.${meetingId}.${id}`;

const isRect = (r: unknown): r is Rect => {
  if (typeof r !== "object" || r === null) return false;
  const { x, y, w, h } = r as Partial<Rect>;
  return [x, y, w, h].every((n) => typeof n === "number" && Number.isFinite(n));
};
const optStr = (v: unknown) => v === undefined || typeof v === "string";

function isContent(value: unknown): value is TileContent {
  if (typeof value !== "object" || value === null) return false;
  const c = value as Record<string, unknown>;
  switch (c.type) {
    case "meeting":
      return typeof c.section === "string" && c.section in SECTION_ICON;
    case "html":
      return optStr(c.src) && optStr(c.srcDoc) && (typeof c.src === "string" || typeof c.srcDoc === "string");
    case "image":
      return typeof c.src === "string";
    case "replay":
      return true;
    case "scratch":
      return optStr(c.text);
    case "markdown":
      return typeof c.text === "string";
    default:
      return false;
  }
}

function isSpec(value: unknown): value is BoardSpec {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<BoardSpec>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.subtitle === "string" &&
    isContent(v.content) &&
    isRect(v.rect)
  );
}

function isFrame(value: unknown): value is BoardFrame {
  if (typeof value !== "object" || value === null) return false;
  const f = value as Partial<BoardFrame>;
  return typeof f.id === "string" && typeof f.title === "string" && optStr(f.note) && isRect(f.rect);
}

/** The saved board: `{ tiles, frames }` (frames are the groups made on it), or
 * the older bare tile array. Anything unreadable opens the default board. */
function loadBoard(meetingId: string): { tiles: BoardSpec[]; frames: BoardFrame[] } {
  const fresh = { tiles: MEETING_TILES, frames: [] };
  try {
    const raw = window.localStorage.getItem(boardKey(meetingId));
    if (!raw) return fresh;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.every(isSpec) ? { tiles: parsed, frames: [] } : fresh;
    if (typeof parsed !== "object" || parsed === null) return fresh;
    const { tiles, frames } = parsed as { tiles?: unknown; frames?: unknown };
    if (!Array.isArray(tiles) || !tiles.every(isSpec)) return fresh;
    return { tiles, frames: Array.isArray(frames) ? frames.filter(isFrame) : [] };
  } catch {
    return fresh;
  }
}

function saveBoard(meetingId: string, serialized: string): void {
  try {
    window.localStorage.setItem(boardKey(meetingId), serialized);
  } catch {
    // Storage blocked: the board lasts for this visit.
  }
}

/** A scratchpad's text: on the tile itself (saved with the board, so an
 * agent can write it and ⌘Z covers it), or — for a scratchpad saved before
 * the text moved onto the tile — its own storage key. */
function scratchText(meetingId: string, id: string, text: string | undefined): string {
  if (text !== undefined) return text;
  try {
    return window.localStorage.getItem(scratchKey(meetingId, id)) ?? "";
  } catch {
    return "";
  }
}


// ── the board ────────────────────────────────────────────────────────────────

type Asking = "html" | "image" | null;

export function MeetingBoard({
  meeting,
  onLayout,
  headerControls,
}: {
  meeting: MeetingRecord;
  onLayout: (next: MeetingLayoutChoice) => void;
  headerControls?: ReactNode;
}) {
  const meetingId = meeting.id;
  const tiles = useBoard<BoardSpec>(() => loadBoard(meetingId));
  const [store, setStore] = useState<SpatialStore | null>(null);
  const [wheelMode, setWheelMode] = useWheelModePreference();
  const [asking, setAsking] = useState<Asking>(null);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const activeOrgId = useAppSelector(selectOrganizationId);

  const serialized = JSON.stringify({ tiles: [...tiles.tiles, ...tiles.parked], frames: tiles.frames });
  useEffect(() => saveBoard(meetingId, serialized), [meetingId, serialized]);

  const specOf = (id: string) => [...tiles.tiles, ...tiles.parked].find((t) => t.id === id);

  const flyWhenPlaced = (id: string) =>
    // The tile registers on its next render; fly once it is there.
    requestAnimationFrame(() => requestAnimationFrame(() => store?.fitItem(id)));

  const addUserTile = (spec: Omit<BoardSpec, "id">) => {
    const id = `user:${Date.now().toString(36)}`;
    let near = { x: NOTES_FRAME.rect.w / 2, y: NOTES_FRAME.rect.h + 400 };
    if (store) {
      const { w, h } = store.getSize();
      near = screenToWorld(store.getCamera(), w / 2, h / 2);
    }
    tiles.addTile({ ...spec, id }, near);
    flyWhenPlaced(id);
  };

  const showMeetingNotes = () => {
    const present = new Set(tiles.tiles.map((t) => t.id));
    const parked = new Set(tiles.parked.map((t) => t.id));
    for (const t of MEETING_TILES) if (parked.has(t.id)) tiles.unparkTile(t.id);
    const missing = MEETING_TILES.filter((t) => !present.has(t.id) && !parked.has(t.id));
    if (missing.length > 0) tiles.addTiles(missing);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => store?.fitItem(`frame:${NOTES_FRAME.id}`)),
    );
  };

  const park = (id: string) => {
    const spec = specOf(id);
    const undo = tiles.parkTile(id);
    toast(`Parked "${spec?.title ?? "tile"}"`, { action: { label: "Undo", onClick: undo } });
  };

  const unpark = (id: string) => {
    tiles.unparkTile(id);
    flyWhenPlaced(id);
  };

  const tileText = (spec: BoardSpec): string => {
    const c = spec.content;
    if (c.type === "html")
      return c.src
        ? `# ${spec.title}\n\nPage: ${new URL(c.src, window.location.origin).href}`
        : `# ${spec.title}\n\n\`\`\`html\n${c.srcDoc ?? ""}\n\`\`\``;
    if (c.type === "image") return `# ${spec.title}\n\n![${spec.title}](${new URL(c.src, window.location.origin).href})`;
    if (c.type === "scratch") return scratchText(meetingId, spec.id, c.text);
    if (c.type === "markdown") return c.text;
    const body = document.querySelector<HTMLElement>(
      `[data-spatial-tile="${CSS.escape(spec.id)}"] [data-spatial-body]`,
    );
    return body?.innerText ?? "";
  };

  const saveAndClose = async (id: string) => {
    const spec = specOf(id);
    if (!spec) return;
    if (!isAuthenticated) {
      toast.error("Notes belong to an account — sign in to save this tile to Notes.");
      return;
    }
    const markdown = tileText(spec);
    if (!markdown.trim()) {
      toast.error(`"${spec.title}" has nothing to save yet.`);
      return;
    }
    try {
      const organizationId = await ensureOrganizationContext({ organizationId: activeOrgId });
      await NotesAPI.create({
        label: `${meeting.title} — ${spec.title}`,
        content: markdown,
        folder_name: "Scratch",
        tags: ["board", "meeting"],
        organization_id: organizationId,
      });
    } catch (err) {
      if (isOrganizationSelectionCancelled(err)) return;
      toast.error(
        `Could not save "${spec.title}" to Notes: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    const undo = tiles.removeTile(id);
    toast.success(`Saved "${spec.title}" to Notes (Scratch) and closed it`, {
      action: { label: "Put back", onClick: undo },
    });
  };

  const remove = async (id: string) => {
    const spec = specOf(id);
    if (!spec) return;
    const ok = await confirm({
      title: `Delete "${spec.title}" from this board?`,
      description:
        spec.content.type === "meeting"
          ? "Only the tile leaves your board — the meeting keeps its notes, and \"Meeting notes\" in the toolbar brings the tile back. You can undo right after."
          : "The tile leaves your board. You can undo right after.",
      confirmLabel: "Delete from board",
      variant: "destructive",
    });
    if (!ok) return;
    const undo = tiles.removeTile(id);
    toast(`Deleted "${spec.title}" from the board`, { action: { label: "Undo", onClick: undo } });
  };

  const onThrow = (id: string, direction: ThrowDirection) => {
    const action = DEFAULT_THROW_ACTIONS[direction];
    if (action === "park") park(id);
    else if (action === "save-close") void saveAndClose(id);
    else if (action === "delete") void remove(id);
  };

  const confirmUrl = (value: string) => {
    const kind = asking;
    setAsking(null);
    const url = value.trim();
    const host = new URL(url).hostname;
    if (kind === "html") {
      addUserTile({
        rect: { x: 0, y: 0, w: 640, h: 460 },
        title: host,
        subtitle: "Web page · sandboxed",
        content: { type: "html", src: url },
      });
    } else if (kind === "image") {
      addUserTile({
        rect: { x: 0, y: 0, w: 560, h: 380 },
        title: host,
        subtitle: "Image",
        content: { type: "image", src: url },
      });
    }
  };

  const rectById = new Map(tiles.tiles.map((t) => [t.id, t.rect]));

  const agentHost: BoardToolHost<BoardSpec> = {
    board: tiles,
    store,
    boardTitle: meeting.title,
    createTile: createAgentTile,
    editTile: editAgentTile,
    describe: describeTile,
  };

  return (
    <SpatialBoardSurface host={agentHost}>
      <div className="mx-meet">
        <ConsentNotice />
        <AttendanceNotice />
        <BoardHeader onLayout={onLayout} headerControls={headerControls} />
        <div className="relative min-h-0 flex-1">
          <SpatialBoardMenu
            store={store}
            actions={{ park, saveAndClose: (id) => void saveAndClose(id), remove: (id) => void remove(id) }}
            parked={tiles.parked.map((t) => ({ id: t.id, title: t.title }))}
            onUnpark={unpark}
            wheelMode={wheelMode}
            onWheelMode={setWheelMode}
          >
            <SpatialViewport
              insets={{ top: 64, bottom: 64 }}
              wheelMode={wheelMode}
              onStore={setStore}
              overlay={
                <>
                  <BoardToolbar
                    onMeetingNotes={showMeetingNotes}
                    onAsk={setAsking}
                    onAdd={addUserTile}
                  />
                  <ParkedShelf
                    className="left-4 right-auto top-16"
                    parked={tiles.parked.map((t) => ({ id: t.id, title: t.title, icon: iconOf(t.content) }))}
                    onRestore={unpark}
                  />
                  <ZoomHud />
                  <Minimap />
                  <div className="pointer-events-none absolute inset-x-0 bottom-16 flex justify-center">
                    <Captions />
                  </div>
                  <PeopleStrip />
                </>
              }
            >
              <SpatialFrame {...NOTES_FRAME} />
              {tiles.frames.map((f) => (
                <SpatialFrame key={f.id} {...f} />
              ))}
              {tiles.connections.map((c) => {
                const from = rectById.get(c.from);
                const to = rectById.get(c.to);
                if (!from || !to) return null;
                return <SpatialEdge key={c.id} from={from} to={to} />;
              })}
              {tiles.tiles.map((t) => (
                <BoardTile
                  key={t.id}
                  spec={t}
                  meetingId={meetingId}
                  onMove={tiles.moveTile}
                  onThrow={onThrow}
                  onContent={(id, content) => tiles.updateTile(id, { content }, { history: false })}
                />
              ))}
            </SpatialViewport>
          </SpatialBoardMenu>
        </div>
        <ControlBar />
        <TextInputDialog
          key={asking ?? "closed"}
          open={asking !== null}
          onOpenChange={(open) => {
            if (!open) setAsking(null);
          }}
          title={asking === "image" ? "Add an image" : "Add a web page"}
          description={
            asking === "image"
              ? "Paste the image's address. It sits on your board only — nobody else in the meeting sees it."
              : "Paste the page's address. It runs sandboxed and sits on your board only. Some sites refuse to be shown inside another page; those say so in the tile."
          }
          placeholder="https://"
          confirmLabel="Add to board"
          validate={validateUrl}
          onConfirm={confirmUrl}
        />
      </div>
    </SpatialBoardSurface>
  );
}

// ── what the board's agent tools make and change (useBoardAgentTools) ───────

type Failure = { ok: false; error: string };

function createAgentTile(id: string, input: AddTileInput, size: { w: number; h: number }): BoardSpec | Failure {
  const rect = { x: 0, y: 0, ...size };
  switch (input.kind) {
    case "note":
      // A note here is this board's scratchpad: the viewer's own, kept with the board.
      return {
        id,
        rect,
        title: input.title ?? "Note",
        subtitle: "Scratchpad · by an agent",
        content: { type: "scratch", text: input.text ?? "" },
      };
    case "markdown":
    case "text":
      if (!input.text) return { ok: false, error: `A ${input.kind} tile needs \`text\`.` };
      return {
        id,
        rect,
        title: input.title ?? (input.kind === "text" ? "Text" : "Write-up"),
        subtitle: "Markdown · by an agent",
        content: { type: "markdown", text: input.text },
      };
    case "html":
      if (input.html)
        return {
          id,
          rect,
          title: input.title ?? "Page",
          subtitle: "Generated page · sandboxed",
          content: { type: "html", srcDoc: input.html },
        };
      if (input.url)
        return {
          id,
          rect,
          title: input.title ?? "Page",
          subtitle: "Web page · sandboxed",
          content: { type: "html", src: input.url },
        };
      return { ok: false, error: "An html tile needs `html` (a complete document) or `url`." };
    case "image":
      if (!input.url) return { ok: false, error: "An image tile needs `url`." };
      return { id, rect, title: input.title ?? "Image", subtitle: "Image", content: { type: "image", src: input.url } };
  }
}

function editAgentTile(tile: BoardSpec, input: EditTileInput): Partial<BoardSpec> | Failure {
  const c = tile.content;
  if (c.type === "meeting")
    return {
      ok: false,
      error: `"${tile.title}" is live from the meeting assistant — only its title and size change. Add a markdown tile beside it instead.`,
    };
  if (c.type === "markdown" && input.text !== undefined) return { content: { type: "markdown", text: input.text } };
  if (c.type === "scratch" && input.text !== undefined) return { content: { type: "scratch", text: input.text } };
  if (c.type === "html" && input.html !== undefined) return { content: { type: "html", srcDoc: input.html } };
  return {
    ok: false,
    error: `"${tile.title}" is a ${describeTile(tile).kind} tile; that content cannot be replaced (only its title and size). ${
      c.type === "html" ? "Pass `html` to replace a page." : "Add a new tile instead."
    }`,
  };
}

function describeTile(tile: BoardSpec): { kind: string; status?: string | null } {
  const c = tile.content;
  switch (c.type) {
    case "meeting":
      return { kind: `meeting ${c.section}`, status: "live" };
    case "scratch":
      return { kind: "note" };
    case "replay":
      return { kind: "stream" };
    case "html":
      return { kind: c.srcDoc !== undefined ? "html" : "web page" };
    default:
      return { kind: c.type };
  }
}

function validateUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? null : "Use an address that starts with https://";
  } catch {
    return "That is not a web address — it should start with https://";
  }
}

// ── header ───────────────────────────────────────────────────────────────────

/** Its own component so the per-second clock and roster changes re-render
 * only this line, never the board. */
function BoardHeader({
  onLayout,
  headerControls,
}: {
  onLayout: (next: MeetingLayoutChoice) => void;
  headerControls?: ReactNode;
}) {
  const snapshot = useMeetSnapshot();
  const isHost = useIsHost();
  const elapsed = useElapsed(snapshot?.meeting?.startedAt ?? null);
  return (
    <>
      <header className="mx-meet__header">
        <h1 className="mx-meet__title">{snapshot?.meeting?.title ?? "Meeting"}</h1>
        <span className="mx-meet__meta">
          {`${participantSummary(snapshot?.participants ?? [])}${elapsed > 0 ? ` · ${formatElapsed(elapsed)}` : ""}`}
        </span>
        <RecordingIndicator />
        {snapshot?.locked === true && (
          <span className="mx-meet__badge">
            <Lock className="h-3 w-3" /> Locked
          </span>
        )}
        {/* The package's own host menu (lock / end), @ai-matrx/meet 0.7.5 — the
            Board used to send a host back to the Room layout for it. */}
        {isHost && <HostMenu />}
        {headerControls}
        <LayoutSwitch value="board" onChange={onLayout} />
      </header>
      {snapshot?.phase === "reconnecting" && (
        <p className="mx-meet__banner" role="status">
          Reconnecting…
        </p>
      )}
    </>
  );
}

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

// ── toolbar ──────────────────────────────────────────────────────────────────

function BoardToolbar({
  onMeetingNotes,
  onAsk,
  onAdd,
}: {
  onMeetingNotes: () => void;
  onAsk: (kind: Asking) => void;
  onAdd: (spec: Omit<BoardSpec, "id">) => void;
}) {
  return (
    <div
      data-spatial-chrome
      className="absolute left-4 top-4 flex items-center gap-1.5 rounded-lg border border-border bg-card/95 p-1.5 shadow-md backdrop-blur"
    >
      <Button size="sm" variant="outline" onClick={onMeetingNotes} title="Fly to the meeting's live notes">
        <NotebookPen className="mr-1.5 h-3.5 w-3.5" />
        Meeting notes
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            Only you see what you add
          </DropdownMenuLabel>
          <DropdownMenuItem
            onSelect={() =>
              onAdd({
                rect: { x: 0, y: 0, w: 480, h: 360 },
                title: "Scratchpad",
                subtitle: "Yours · kept in this browser",
                content: { type: "scratch", text: "" },
              })
            }
          >
            <StickyNote className="mr-2 h-4 w-4" />
            Scratchpad
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAsk("html")}>
            <Globe className="mr-2 h-4 w-4" />
            Web page…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAsk("image")}>
            <ImageIcon className="mr-2 h-4 w-4" />
            Image…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Samples</DropdownMenuLabel>
          {SAMPLE_PAGES.map((page) => (
            <DropdownMenuItem
              key={page.src}
              onSelect={() =>
                onAdd({
                  rect: { x: 0, y: 0, w: 640, h: 460 },
                  title: page.title,
                  subtitle: "Generated HTML · sandboxed",
                  content: { type: "html", src: page.src },
                })
              }
            >
              <Code2 className="mr-2 h-4 w-4" />
              {page.title}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onSelect={() =>
              onAdd({
                rect: { x: 0, y: 0, w: 640, h: 900 },
                title: "Research report",
                subtitle: "Stream · replay",
                content: { type: "replay" },
              })
            }
          >
            <FileText className="mr-2 h-4 w-4" />
            Research report (replayed stream)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── tiles ────────────────────────────────────────────────────────────────────

interface TileProps {
  spec: BoardSpec;
  meetingId: string;
  onMove: (id: string, x: number, y: number) => void;
  onThrow: (id: string, direction: ThrowDirection) => void;
  /** Content changed from inside the tile (typing) — no undo step. */
  onContent: (id: string, content: TileContent) => void;
}

function BoardTile(props: TileProps) {
  const c = props.spec.content;
  if (c.type === "meeting") return <MeetingNoteTile {...props} section={c.section} />;
  if (c.type === "replay") return <ReplayTile {...props} />;
  return <StaticTile {...props} />;
}

function MeetingNoteTile({ spec, onMove, onThrow, section }: TileProps & { section: MeetingSection }) {
  const status = useMeetingSectionStatus();
  return (
    <SpatialTile
      id={spec.id}
      rect={spec.rect}
      title={spec.title}
      subtitle={spec.subtitle}
      icon={iconOf(spec.content)}
      statusFrom={{ kind: "static", value: status }}
      onMove={onMove}
      onThrow={onThrow}
    >
      {() => <MeetingSectionBody section={section} />}
    </SpatialTile>
  );
}

function ReplayTile({ spec, onMove, onThrow }: TileProps) {
  const [stream] = useState(() => new ReplayStream(spec.id, RESEARCH_REPORT));
  useEffect(() => {
    stream.start({});
    return () => stream.stop();
  }, [stream]);
  return (
    <SpatialTile
      id={spec.id}
      rect={spec.rect}
      title={spec.title}
      subtitle={spec.subtitle}
      icon={iconOf(spec.content)}
      statusFrom={{ kind: "self", source: stream }}
      onMove={onMove}
      onThrow={onThrow}
    >
      {(tier) => <StreamTileBody source={stream} tier={tier} />}
    </SpatialTile>
  );
}

const DONE = { kind: "static", value: { status: "complete", progress: null } } as const;

function StaticTile({ spec, meetingId, onMove, onThrow, onContent }: TileProps) {
  const interacting = useEditingTile() === spec.id;
  const c = spec.content;
  return (
    <SpatialTile
      id={spec.id}
      rect={spec.rect}
      title={spec.title}
      subtitle={spec.subtitle}
      icon={iconOf(c)}
      statusFrom={DONE}
      onMove={onMove}
      onThrow={onThrow}
    >
      {(tier) => {
        if (c.type === "html")
          return <HtmlTileBody src={c.src} srcDoc={c.srcDoc} title={spec.title} tier={tier} active={interacting} />;
        if (c.type === "image") return <ImageTileBody src={c.src} alt={spec.title} />;
        if (c.type === "markdown") return <MarkdownTileBody id={spec.id} text={c.text} tier={tier} />;
        return (
          <ScratchBody
            text={scratchText(meetingId, spec.id, c.type === "scratch" ? c.text : undefined)}
            onChange={(text) => onContent(spec.id, { type: "scratch", text })}
          />
        );
      }}
    </SpatialTile>
  );
}

function ScratchBody({ text, onChange }: { text: string; onChange: (text: string) => void }) {
  return (
    <textarea
      data-spatial-scroll
      value={text}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Anything you want beside the meeting. It stays on this board, in this browser."
      aria-label="Scratchpad"
      className="h-full w-full resize-none bg-card p-4 text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground"
    />
  );
}
