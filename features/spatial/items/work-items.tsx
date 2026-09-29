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

import { useEffect, useEffectEvent, useState, type ReactNode } from "react";
import { File as FileIcon, FolderOpen, MessagesSquare, StickyNote, Upload } from "lucide-react";
import { AgentListInlinePicker } from "@ai-matrx/agents/catalog/react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { ConversationHistorySidebar } from "@/features/agents/components/conversation-history/ConversationHistorySidebar";
import { ChatConversationSurface } from "@/features/agents/components/chat/ChatConversationSurface";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";
import {
  selectAgentIdFromInstance,
  selectConversationTitle,
} from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { useRetainLatestRequestForViewer } from "@/features/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import { CanvasChatColumn } from "@/features/canvas/workspace/CanvasChatColumn";
import { useCanvasWorkspaceConversation } from "@/features/canvas/workspace/useCanvasWorkspaceConversation";
import { NotePickerInline } from "@/features/notes/components/NotePickerPopover";
import { SingleFileSurfaceHost } from "@/features/files/components/surfaces/single-file/SingleFileSurfaceHost";
import { SingleFileWorkspace } from "@/features/files/components/surfaces/single-file/SingleFileWorkspace";
import { FILE_SURFACE_NAME } from "@/features/surfaces/manifests/file.manifest";
import { FilesResourcePicker } from "@/features/resource-manager/resource-picker/FilesResourcePicker";
import { InlineUploadArea } from "@/features/resource-manager/resource-picker/InlineUploadArea";
import { NoteItemBody } from "./NoteItemBody";
import type { NodeSource } from "../board/document";
import type { BoardItemType, ItemBodyProps, PickerProps, PlacedItem } from "./types";
import {
  chatAgentId,
  chatSource,
  entityId,
  fileIdOf,
  fileItem,
  isEntity,
} from "./work-sources";

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
function ChatBody({ tileId, source, title, onSource }: ItemBodyProps) {
  const store = useAppStore();
  const surfaceKey = `board-chat:${tileId}`;
  const savedId = entityId(source);
  const chosenAgentId = chatAgentId(source);
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
  useRetainLatestRequestForViewer(conversationId, "spatial-board-chat-tile");

  // A new conversation (or the composer's agent switch) → save its id, and
  // its agent, so a reload reopens THAT conversation.
  const conversationTitle = useAppSelector((s) => (conversationId ? selectConversationTitle(conversationId)(s) : null));
  const record = useEffectEvent((id: string, nextTitle: string | null) => {
    if (id !== savedId) {
      const agentId = selectAgentIdFromInstance(id)(store.getState()) ?? chosenAgentId;
      onSource(chatSource(id, agentId), nextTitle ?? undefined);
    } else if (nextTitle && nextTitle !== title) {
      // The server titles a conversation after its first turn; the tile follows.
      onSource(source, nextTitle);
    }
  });
  useEffect(() => {
    if (conversationId) record(conversationId, conversationTitle);
  }, [conversationId, conversationTitle]);

  if (!isEntity(source, "chat")) return null;
  const column = (
    <CanvasChatColumn
      conversation={chat.conversation}
      surfaceKey={surfaceKey}
      onSelectAgent={chat.startWith}
      className="bg-card"
    />
  );
  // The surface exists once there is a conversation to describe.
  if (!conversationId) return column;
  return (
    <ChatConversationSurface conversationId={conversationId} agentId={agentId ?? chosenAgentId ?? ""} surfaceKey={surfaceKey}>
      {column}
    </ChatConversationSurface>
  );
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
          scopeId="spatial-board-chat-picker"
          agentIds={ALL_AGENTS}
          surfaceId="conversation-picker"
          onOpenConversation={(conv) =>
            onPick([
              {
                title: conv.title?.trim() || "Chat",
                source: chatSource(conv.conversationId, conv.agentId ?? null),
              },
            ])
          }
          openInPlace
          historyLabel="Conversations"
          initialSearchOpen
          className="h-full bg-transparent"
        />
      </div>
      <div className="flex shrink-0 justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
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
          consumerId="spatial-board-chat-agent"
          defaultMandateKey={DEFAULT_NEW_CHAT_MANDATE_KEY}
          className="h-full"
          onSelect={(agentId) => onPick([{ title: "Chat", source: chatSource(null, agentId) }])}
        />
      </div>
      <div className="flex shrink-0 justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
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
            onPick([{ title: note?.label?.trim() || "Note", source: { kind: "entity", entity: "note", id: noteId } }])
          }
        />
      </div>
      <div className="flex justify-end">
        <Button type="button" variant="ghost" onClick={onCancel}>
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
function FileBody({ source }: ItemBodyProps) {
  const fileId = fileIdOf(source);
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
      <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="File source">
        {(
          [
            { id: "library", label: "File from your files", Icon: FolderOpen },
            { id: "upload", label: "Upload from computer", Icon: Upload },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            disabled={busy}
            onClick={() => setMode(id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
              mode === id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>
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
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Registry ─────────────────────────────────────────────────────────────────

export const WORK_ITEMS: BoardItemType[] = [
  {
    key: "chat",
    surface: { name: "matrx-user/chat" },
    label: "Chat",
    icon: MessagesSquare,
    group: "work",
    defaultSize: { w: 520, h: 760 },
    matches: (s) => isEntity(s, "chat"),
    Body: ChatBody,
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
    href: (s) => {
      const id = entityId(s);
      return id ? `/chat/${id}` : null;
    },
    kindLabel: "chat",
  },
  {
    key: "note",
    surface: { name: "matrx-user/notes" },
    label: "Note",
    icon: StickyNote,
    group: "work",
    // Room for the notes core: modes + tools, the editor, metadata and save strip.
    defaultSize: { w: 560, h: 620 },
    matches: (s) => isEntity(s, "note"),
    Body: NoteItemBody,
    startNew: {
      label: "Note",
      create: (): PlacedItem => ({ title: "Note", source: { kind: "entity", entity: "note", id: null } }),
    },
    bringIn: { label: "Note from Notes", Picker: NotePicker },
    href: (s) => {
      const id = entityId(s);
      return id ? `/notes/${id}` : null;
    },
    kindLabel: "note",
  },
  {
    key: "file",
    surface: { name: FILE_SURFACE_NAME, Host: FileSurfaceHost },
    label: "File",
    icon: FileIcon,
    group: "work",
    defaultSize: { w: 800, h: 600 },
    matches: (s: NodeSource) => fileIdOf(s) !== null || isEntity(s, "file"),
    Body: FileBody,
    bringIn: { label: "File", Picker: FilePicker },
    href: (s) => {
      const id = fileIdOf(s);
      return id ? `/files/f/${id}` : null;
    },
    kindLabel: "file",
  },
];
