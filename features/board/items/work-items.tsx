"use client";

/**
 * Work items on a board: Chat, Note, File. Each Body is the feature's
 * canonical component (see ./types.ts) — the platform's one chat column, the
 * real Note editor, the real single-file workspace — never a board copy. The chat tile
 * reuses the canvas workspace's conversation hook and chat column, and mounts
 * the chat's own agent surface (`ChatConversationSurface`, the one `/chat`
 * mounts) for its conversation.
 *
 * Saved sources (board/document.ts `NodeSource`):
 *   chat  `{ kind: "entity", entity: "chat", id: conversationId | null, meta?: { agentId } }`
 *   note  `{ kind: "entity", entity: "note", id: noteId | null, meta?: { seed, draft } }`
 *         (lifecycle: ./work-sources.ts `noteTilePlan`)
 *   file  `{ kind: "entity", entity: "file", id: fileId }` — the older
 *         `{ kind: "file", fileId }` source is still rendered as-is (read both,
 *         write the entity form; no migration pass is needed).
 */

import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { File as FileIcon, FolderOpen, MessagesSquare, PanelLeftClose, PanelLeftOpen, NotebookText, Plus, Upload } from "lucide-react";
import { AgentListInlinePicker } from "@ai-matrx/agents/catalog/react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PANEL_MOTION_CLASS } from "@ai-matrx/design-system";
import type { ConversationListItem } from "@ai-matrx/chat/agents/redux/conversation-list/conversation-list.types";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { ConversationHistorySidebar } from "@ai-matrx/chat/agents/components/conversation-history/ConversationHistorySidebar";
import { ChatConversationSurface } from "@ai-matrx/chat/agents/components/chat/ChatConversationSurface";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@ai-matrx/chat/agents/components/chat/chat-quick-actions.config";
import {
  selectAgentIdFromInstance,
  selectConversationTitle,
  selectIsCacheOnly,
} from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors";
import { useRetainLatestRequestForViewer } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import { CanvasChatColumn } from "@ai-matrx/chat/canvas/workspace/CanvasChatColumn";
import { useCanvasWorkspaceConversation } from "@ai-matrx/chat/canvas/workspace/useCanvasWorkspaceConversation";
import { NotePickerInline } from "@/features/notes/components/NotePickerPopover";
import { SingleFileSurfaceHost } from "@/features/files/components/surfaces/single-file/SingleFileSurfaceHost";
import { SingleFileWorkspace } from "@/features/files/components/surfaces/single-file/SingleFileWorkspace";
import { FILE_SURFACE_NAME } from "@/features/surfaces/manifests/file.manifest";
import { selectFileById } from "@/features/files/redux/selectors";
import { FilesResourcePicker } from "@/features/resource-manager/resource-picker/FilesResourcePicker";
import { InlineUploadArea } from "@/features/resource-manager/resource-picker/InlineUploadArea";
import { NoteItemBody } from "./NoteItemBody";
import { AGENT_FORM_PLACEHOLDER_TITLE, AgentFormItemBody } from "./AgentFormItemBody";
import type { NodeSource } from "../board/document";
import { useBoardCameraStore } from "../engine/react";
import { entityComments, type BoardItemType, type HeaderActionProps, type ItemBodyProps, type PickerProps, type PlacedItem } from "./types";
import { useBoardChats } from "./board-chats";
import { ConnectedSourceChips, useConnectedChatContext } from "./connected-sources";
import {
  AGENT_FORM_ENTITY,
  agentFormSource,
  chatAgentId,
  chatListChoice,
  chatListOpen,
  chatSource,
  CHAT_LIST_WIDE_PX,
  chatSourceToSave,
  chatTitleToSave,
  removedChatResetsTile,
  entityId,
  fileIdOf,
  chatItem,
  fileItem,
  noteItem,
  isEntity,
  withChatList,
} from "./work-sources";
import { titleToAdopt } from "./feature-items.logic";
import { useChatStatus, useFileStatus, useNoteStatus } from "./item-status";
import { SegmentedControl } from "@ai-matrx/design-system/controls";

// ── Chat ─────────────────────────────────────────────────────────────────────

/**
 * A chat tile is the canvas workspace's own chat: its conversation hook
 * (`useCanvasWorkspaceConversation` — launch under the default chat mandate or
 * the chosen agent, reopen a saved one IN PLACE through the canonical resume
 * sequence so a turn that was mid-run at reload reattaches, wait on the
 * organization gate) and its column (`CanvasChatColumn` — the platform's one
 * chat column, `AgentConversationColumn`, in its compact composer size, with
 * the agent switch). Keyed per tile by `surfaceKey`.
 *
 * Its agent surface is `/chat`'s own (`ChatConversationSurface`,
 * `matrx-user/chat`) for THIS conversation: an agent beside the board reads the
 * conversation, its transcript and its composer, and writes through the same
 * targets the chat page offers (send a message, edit, regenerate, fork, stop,
 * rename). The tile's own conversation is the surface's `ownConversationId`,
 * so it never sees itself as context — and its launch opts out of adopting a
 * mounted surface, exactly as /chat's own launcher does.
 */
function ChatBody({ tileId, source, title, tier, onSource }: ItemBodyProps) {
  const store = useAppStore();
  const surfaceKey = `board-chat:${tileId}`;
  const savedId = entityId(source);
  const chosenAgentId = chatAgentId(source);
  const list = chatListChoice(source);
  const boardChats = useBoardChats();
  // Read once, at mount: reopen THIS conversation, or start one.
  const chat = useCanvasWorkspaceConversation(surfaceKey, {
    start: savedId
      ? { kind: "open", conversationId: savedId, agentId: chosenAgentId }
      : chosenAgentId
        ? { kind: "agent", agentId: chosenAgentId }
        : { kind: "new" },
    surfaceName: null,
  });
  const conversationId = chat.conversationId;
  const agentId = useAppSelector((s) => (conversationId ? selectAgentIdFromInstance(conversationId)(s) : null));

  // A viewer of the conversation's run holds it (LIVE-RUN-RETENTION.md), so a
  // launcher reap never blanks the tile mid-stream.
  useRetainLatestRequestForViewer(conversationId, "board-chat-tile");

  // A new conversation (or the composer's agent switch) → save its id, and
  // its agent, so a reload reopens THAT conversation.
  const conversationTitle = useAppSelector((s) => (conversationId ? selectConversationTitle(conversationId)(s) : null));
  // A conversation the server does not have yet (nothing sent) is never saved by id.
  const serverHasIt = useAppSelector((s) => (conversationId ? !selectIsCacheOnly(conversationId)(s) : false));
  const record = useEffectEvent((id: string, nextTitle: string | null) => {
    const next = chatSourceToSave({
      conversationId: id,
      serverHasIt,
      savedId,
      agentId: selectAgentIdFromInstance(id)(store.getState()) ?? null,
      chosenAgentId: chosenAgentId ?? null,
      list,
    });
    if (next) {
      onSource(next, chatTitleToSave({ serverHasIt, conversationTitle: nextTitle }));
    } else if (serverHasIt && nextTitle && nextTitle !== title) {
      // The server titles a conversation after its first turn; the tile follows.
      onSource(source, nextTitle);
    }
  });
  useEffect(() => {
    if (conversationId) record(conversationId, conversationTitle);
  }, [conversationId, conversationTitle, serverHasIt]);

  // The conversation belongs to this board once the server has it (started
  // here, brought in, or added by an agent — each mounts a tile).
  const file = boardChats?.file;
  useEffect(() => {
    if (conversationId && serverHasIt && file) file(conversationId);
  }, [conversationId, serverHasIt, file]);

  // The list: the board's conversations beside the chat. Open on a wide tile,
  // behind the header toggle on a narrow one; the person's choice is saved.
  const { ref: frameRef, width } = useElementWidth();
  const listOn = !!boardChats && (tier === "read" || tier === "glance");
  const open = listOn && chatListOpen(source, width);
  const setOpen = (next: boolean) => onSource(withChatList(source, next ? "open" : "closed"));
  const narrow = width < CHAT_LIST_WIDE_PX;
  const switchTo = (conv: ConversationListItem) => {
    chat.openExisting(conv.conversationId, conv.agentId ?? null);
    if (narrow) setOpen(false);
  };

  // Lines are context: the full values of every tile joined to this chat by a line ride in THIS chat's
  // own context (tools/tile-context.ts), through the chat column's one named context entry.
  const getCanvasContext = useConnectedChatContext(tileId, conversationId);

  if (!isEntity(source, "chat")) return null;
  const column = (
    <CanvasChatColumn
      conversation={chat.conversation}
      surfaceKey={surfaceKey}
      getCanvasContext={getCanvasContext}
      onSelectAgent={chat.startWith}
      className="bg-card"
    />
  );
  // The surface exists once there is a conversation to describe.
  const surfaced = !conversationId ? (
    column
  ) : (
    <ChatConversationSurface conversationId={conversationId} agentId={agentId ?? chosenAgentId ?? ""} surfaceKey={surfaceKey}>
      {column}
    </ChatConversationSurface>
  );
  if (!boardChats) return surfaced;
  return (
    <div ref={frameRef} className="relative flex h-full min-h-0 w-full">
      {listOn && (
        <aside
          inert={!open}
          aria-hidden={!open}
          data-board-chat-list
          className={cn(
            "z-10 flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-border bg-card transition-[width,opacity,border-width] motion-reduce:transition-none",
            PANEL_MOTION_CLASS,
            narrow ? "absolute inset-y-0 left-0 shadow-xl" : "relative",
            open ? "w-[min(15rem,85%)] border-r opacity-100" : "w-0 border-r-0 opacity-0",
          )}
        >
          <div className="flex h-full w-[min(15rem,85vw)] min-w-0 flex-col">
            <BoardChatList
              activeConversationId={conversationId}
              onSwitch={switchTo}
              // A new conversation keeps the list as the person left it (open stays open).
              onNew={() => chat.startNew()}
              onClose={() => setOpen(false)}
            />
          </div>
        </aside>
      )}
      <div className="h-full min-h-0 min-w-0 flex-1">{surfaced}</div>
    </div>
  );
}

/** The sidebar inside the chat tile: New conversation + collapse over the board's list. */
function BoardChatList({
  activeConversationId,
  onSwitch,
  onNew,
  onClose,
}: {
  activeConversationId: string | null;
  onSwitch: (conv: ConversationListItem) => void;
  onNew: () => void;
  onClose: () => void;
}) {
  const boardChats = useBoardChats();
  // The board's conversations are not known yet: nothing is listed (and nothing
  // is read) rather than the person's whole library.
  if (!boardChats || boardChats.ids === null) return null;
  return (
    <ConversationHistorySidebar
      variant="dense"
      scopeId={`board-chats:${boardChats.boardId}`}
      agentIds={ALL_AGENTS}
      onlyConversationIds={boardChats.ids}
      removeFromList={{
        label: "Remove from this board",
        onRemove: (conv) => {
          boardChats.unfile(conv.conversationId);
          if (removedChatResetsTile(conv.conversationId, activeConversationId)) onNew();
        },
      }}
      activeConversationId={activeConversationId}
      onOpenConversation={onSwitch}
      openInPlace
      keepLoaded
      serverSearch={false}
      showGroupingToggle={false}
      titleFirst
      emptyState={<p className="px-2 py-1 text-xs text-muted-foreground">No chats on this board yet</p>}
      headerSlot={
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
          <Button type="button" variant="quiet" onClick={onClose} aria-label="Close sidebar" title="Close sidebar">
            <PanelLeftClose className="h-3.5 w-3.5" />
          </Button>
          <Button type="button" variant="outline" onClick={onNew} className="min-w-0 flex-1 justify-start gap-1">
            <Plus className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">New conversation</span>
          </Button>
        </div>
      }
      className="h-full bg-transparent"
    />
  );
}

/** The header toggle: show or hide the tile's conversation list (no new row). */
function ChatHeaderAction(props: HeaderActionProps) {
  if (!isEntity(props.source, "chat")) return null;
  return (
    <>
      <ConnectedSourceChips tileId={props.tileId} width={props.width} />
      <ChatListToggle {...props} />
    </>
  );
}

function ChatListToggle({ source, width, onSource }: HeaderActionProps) {
  const boardChats = useBoardChats();
  if (!boardChats || !isEntity(source, "chat")) return null;
  const open = chatListOpen(source, width);
  const Icon = open ? PanelLeftClose : PanelLeftOpen;
  const label = open ? "Close conversations" : "Show conversations";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={open}
      onClick={() => onSource(withChatList(source, open ? "closed" : "open"))}
      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/** The element's width in CSS px (the tile's container, not the zoomed screen). */
function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.offsetWidth);
    const ro = new ResizeObserver(() => setWidth(el.offsetWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/** Stable empty list: `agentIds: []` = every conversation the person can open. */
const ALL_AGENTS: string[] = [];

/** Bring in: one of the person's conversations, reopened in the tile. */
function ChatPicker({ onPick, onCancel }: PickerProps) {
  return (
    <div className="flex h-[520px] min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        <ConversationHistorySidebar
          variant="dense"
          scopeId="board-chat-picker"
          agentIds={ALL_AGENTS}
          surfaceId="conversation-picker"
          onOpenConversation={(conv) =>
            onPick([chatItem(conv.conversationId, conv.title, conv.agentId ?? null)])
          }
          openInPlace
          className="h-full bg-transparent"
        />
      </div>
      <div className="flex shrink-0 justify-end">
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/** Start new: a chat with the agent the person picks — the ONE agent picker. */
function AgentChatPicker({ onPick, onCancel }: PickerProps) {
  return (
    <div className="flex h-[520px] min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        <AgentListInlinePicker
          consumerId="board-chat-agent"
          defaultMandateKey={DEFAULT_NEW_CHAT_MANDATE_KEY}
          className="h-full"
          onSelect={(agentId) => onPick([{ title: "Chat", source: chatSource(null, agentId) }])}
        />
      </div>
      <div className="flex shrink-0 justify-end">
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Agent form ───────────────────────────────────────────────────────────────

/** Start new: the agent whose form the tile runs — the ONE agent picker. */
function AgentFormPicker({ onPick, onCancel }: PickerProps) {
  return (
    <div className="flex h-[520px] min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        <AgentListInlinePicker
          consumerId="board-agent-form"
          className="h-full"
          onSelect={(agentId) => onPick([{ title: AGENT_FORM_PLACEHOLDER_TITLE, source: agentFormSource(null, agentId) }])}
        />
      </div>
      <div className="flex shrink-0 justify-end">
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Note ─────────────────────────────────────────────────────────────────────

function NotePicker({ onPick, onCancel }: PickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border border-border">
        <NotePickerInline
          onSelectNote={(noteId, note) =>
            onPick([noteItem(noteId, note?.label)])
          }
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── File ─────────────────────────────────────────────────────────────────────

/**
 * The file's surface host for one tile — the SAME `SingleFileSurfaceHost` the
 * `/files/f/[id]` page mounts (values, rename / move / sharing / restore
 * write targets, open-tab / go-to-page / download tools). Keyed by file so a
 * re-pointed tile starts on Preview.
 */
function FileSurfaceHost({ source, children }: { source: NodeSource; children: ReactNode }) {
  const fileId = fileIdOf(source);
  if (!fileId) return <>{children}</>;
  return (
    <SingleFileSurfaceHost key={fileId} fileId={fileId}>
      {children}
    </SingleFileSurfaceHost>
  );
}

/**
 * The file page's own working area: the file's name menu and actions, the
 * per-tab control rail and all seven tabs (Preview, Edit, Knowledge,
 * Analysis, Share, Info, Versions). Route navigation (back, breadcrumb, Show
 * files) is the page's, not the file's, so it is not here.
 */
function FileBody({ source, title, onSource }: ItemBodyProps) {
  const fileId = fileIdOf(source);
  // The tile's title follows the file's name, so a rename (on the tile, the file's page or by an
  // agent) never leaves the board — and `board_items` — naming the file by its old name.
  const fileName = useAppSelector((state) => (fileId ? selectFileById(state, fileId)?.fileName : undefined));
  const adopt = titleToAdopt(title, fileName);
  useEffect(() => {
    if (adopt) onSource(source, adopt);
  }, [adopt, source, onSource]);
  if (!fileId) {
    return (
      <div className="flex h-full items-center justify-center bg-card p-4 text-xs text-muted-foreground">
        This file tile has no file yet. Remove it and add the file again.
      </div>
    );
  }
  return <SingleFileWorkspace toolbar density="compact" className="h-full" />;
}

function FilePicker({ onPick, onCancel }: PickerProps) {
  const [mode, setMode] = useState<"library" | "upload">("library");
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex h-[520px] min-h-0 flex-col gap-2">
      <SegmentedControl aria-label="File source" fill value={mode} onValueChange={setMode} data={([{ value: "library", label: "File from your files", Icon: FolderOpen }, { value: "upload", label: "Upload from computer", Icon: Upload }] as const).map(({ value, label, Icon }) => ({ value, disabled: busy, label: <span className="inline-flex items-center gap-1.5"><Icon className="size-3.5" />{label}</span> }))} />
      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        {mode === "library" ? (
          <FilesResourcePicker
            fillHost
            title="Your files"
            onBack={onCancel}
            onSelect={(selection) => {
              onPick([fileItem(selection.fileId, selection.details?.filename)]);
            }}
          />
        ) : (
          <div className="h-full overflow-y-auto p-2">
            <InlineUploadArea
              selectionMode="multiple"
              onBusyChange={setBusy}
              onSelect={(files) => onPick(files.map((f) => fileItem(f.fileId, f.name)))}
            />
          </div>
        )}
      </div>
      <div className="flex shrink-0 justify-end">
        <Button type="button" variant="quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Registry ─────────────────────────────────────────────────────────────────

/**
 * What a chat tile keeps while its body sleeps: the conversation's live run
 * (a frozen body released its own hold, and a launcher reap would blank the
 * reply — LIVE-RUN-RETENTION.md), and the tile awake while the agent is
 * working (running, streaming, or waiting on a tool this page runs).
 */
function ChatKeep({ tileId, source }: { tileId: string; source: NodeSource }) {
  const conversationId = entityId(source);
  useRetainLatestRequestForViewer(conversationId, "board-chat-keep");
  const working = useAppSelector((s) => {
    if (!conversationId) return false;
    const status = s.conversations?.byConversationId[conversationId]?.status;
    return status === "running" || status === "streaming" || status === "paused";
  });
  const board = useBoardCameraStore();
  useEffect(() => (working ? board.holdAwake(tileId) : undefined), [working, board, tileId]);
  return null;
}

export const WORK_ITEMS: BoardItemType[] = [
  {
    key: "chat",
    surface: { name: "matrx-user/chat" },
    comments: entityComments("conversation"),
    label: "Chat",
    icon: MessagesSquare,
    group: "work",
    section: "ai",
    accent: "blue",
    status: { useStatus: useChatStatus },
    defaultSize: { w: 520, h: 760 },
    matches: (s) => isEntity(s, "chat"),
    Body: ChatBody,
    HeaderAction: ChatHeaderAction,
    usesTier: true,
    Keep: ChatKeep,
    // Two ways to start: the default chat (the `chat.default_new_chat` job,
    // exactly /chat/new) or a chat with an agent the person picks.
    startNew: [
      {
        label: "Chat",
        create: (): PlacedItem => ({ title: "Chat", source: chatSource(null, null) }),
      },
      { label: "Chat with an agent", icon: AGENT_ICON, Picker: AgentChatPicker },
    ],
    bringIn: { label: "Conversation", Picker: ChatPicker },
    record: { place: (id, title) => chatItem(id, title), searchToken: "conversation" },
    href: (s) => {
      const id = entityId(s);
      return id ? `/chat/${id}` : null;
    },
    kindLabel: "chat",
    // Checked 2026-10-02: transcript, scroll and draft kept; no relaunch; the caret stays put; the draft sends.
    sleeps: true,
  },
  {
    // An agent run with no chat display: inputs form → Run → the reply as its shape.
    // The record is the latest run's conversation, so its surface, comments, status
    // and live-run hold are the chat's own.
    key: AGENT_FORM_ENTITY,
    surface: { name: "matrx-user/chat" },
    comments: entityComments("conversation"),
    label: "Agent form",
    icon: AGENT_ICON,
    group: "work",
    section: "ai",
    accent: "violet",
    status: { useStatus: useChatStatus },
    defaultSize: { w: 560, h: 680 },
    matches: (s) => isEntity(s, AGENT_FORM_ENTITY),
    Body: AgentFormItemBody,
    Keep: ChatKeep,
    startNew: { label: "Agent form", icon: AGENT_ICON, Picker: AgentFormPicker },
    // An agent places a past run by its conversation id (a new one needs the person's agent choice).
    record: { place: (id, title) => ({ title: title?.trim() || AGENT_FORM_PLACEHOLDER_TITLE, source: agentFormSource(id, null) }) },
    href: (s) => {
      const id = entityId(s);
      return id ? `/chat/${id}` : null;
    },
    kindLabel: "agent form",
  },
  {
    key: "note",
    surface: { name: "matrx-user/notes" },
    comments: entityComments("note"),
    label: "Note",
    // The full Note; the board's sticky tool owns the sticky-note icon.
    icon: NotebookText,
    group: "work",
    section: "notes",
    accent: "amber",
    status: { useStatus: useNoteStatus },
    // Room for the notes core: modes + tools, the editor, metadata and save strip.
    defaultSize: { w: 560, h: 620 },
    matches: (s) => isEntity(s, "note"),
    Body: NoteItemBody,
    startNew: {
      label: "Note",
      create: (): PlacedItem => ({ title: "Note", source: { kind: "entity", entity: "note", id: null } }),
    },
    bringIn: { label: "Note from Notes", Picker: NotePicker },
    record: { place: noteItem, searchToken: "note" },
    href: (s) => {
      const id = entityId(s);
      return id ? `/notes/${id}` : null;
    },
    kindLabel: "note",
    // Checked 2026-10-02 (Write view): text kept, no second note, the next edit saves everything.
    sleeps: true,
  },
  {
    key: "file",
    surface: { name: FILE_SURFACE_NAME, Host: FileSurfaceHost },
    comments: (s) => {
      const id = fileIdOf(s) ?? (s.kind === "entity" ? s.id : null);
      return id ? { token: "file", id } : null;
    },
    label: "File",
    icon: FileIcon,
    group: "work",
    section: "media",
    accent: "slate",
    status: { useStatus: useFileStatus },
    defaultSize: { w: 800, h: 600 },
    matches: (s: NodeSource) => fileIdOf(s) !== null || isEntity(s, "file"),
    Body: FileBody,
    bringIn: { label: "File", Picker: FilePicker },
    record: { place: fileItem, searchToken: "file" },
    href: (s) => {
      const id = fileIdOf(s);
      return id ? `/files/f/${id}` : null;
    },
    kindLabel: "file",
    // Checked 2026-10-02: the Edit tab's text, dirty state and undo come back after a sleep and a
    // remount (one working copy per file in the store); the editor re-creates, never blank; one
    // save; the preview is not downloaded again.
    sleeps: true,
  },
];
