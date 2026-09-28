"use client";

/**
 * Work items on a board: Chat, Note, File. Each Body is the feature's
 * canonical component (see ./types.ts) — the platform's one chat column, the
 * real Note editor, the real file preview — never a board copy. The chat tile
 * reuses the canvas workspace's conversation hook and chat column.
 *
 * Saved sources (board/document.ts `NodeSource`):
 *   chat  `{ kind: "entity", entity: "chat", id: conversationId | null, meta?: { agentId } }`
 *   note  `{ kind: "entity", entity: "note", id: noteId | null, meta?: { seed } }`
 *   file  `{ kind: "entity", entity: "file", id: fileId }` — the older
 *         `{ kind: "file", fileId }` source is still rendered as-is (read both,
 *         write the entity form; no migration pass is needed).
 */

import { useEffect, useEffectEvent, useState } from "react";
import { File as FileIcon, FolderOpen, MessagesSquare, StickyNote, Upload } from "lucide-react";
import { AgentListInlinePicker } from "@ai-matrx/agents/catalog/react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { ConversationHistorySidebar } from "@/features/agents/components/conversation-history/ConversationHistorySidebar";
import { DEFAULT_NEW_CHAT_MANDATE_KEY } from "@/features/agents/components/chat/chat-quick-actions.config";
import {
  selectAgentIdFromInstance,
  selectConversationTitle,
} from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { useRetainLatestRequestForViewer } from "@/features/agents/redux/execution-system/active-requests/useRetainRequestForViewer";
import { CanvasChatColumn } from "@/features/canvas/workspace/CanvasChatColumn";
import { useCanvasWorkspaceConversation } from "@/features/canvas/workspace/useCanvasWorkspaceConversation";
import { NotePickerInline } from "@/features/notes/components/NotePickerPopover";
import { FilePreview } from "@/features/files/components/core/FilePreview/FilePreview";
import { FilesResourcePicker } from "@/features/resource-manager/resource-picker/FilesResourcePicker";
import { InlineUploadArea } from "@/features/resource-manager/resource-picker/InlineUploadArea";
import { NoteTileBody } from "../tiles/NoteTileBody";
import type { NodeSource } from "../board/document";
import type { BoardItemType, ItemBodyProps, PickerProps, PlacedItem } from "./types";
import {
  chatAgentId,
  chatSource,
  entityId,
  fileIdOf,
  fileItem,
  isEntity,
  noteSeed,
  noteSource,
} from "./work-sources";

// ── Chat ─────────────────────────────────────────────────────────────────────

/**
 * A chat tile is the canvas workspace's own chat: its conversation hook
 * (`useCanvasWorkspaceConversation` — launch under the default chat mandate or
 * the chosen agent, open a saved one in place, wait on the organization gate)
 * and its column (`CanvasChatColumn` — the platform's one chat column, compact
 * composer, agent switch). Keyed per tile by `surfaceKey`.
 */
function ChatBody({ tileId, source, title, onSource }: ItemBodyProps) {
  const store = useAppStore();
  const surfaceKey = `board-chat:${tileId}`;
  const savedId = entityId(source);
  const chosenAgentId = chatAgentId(source);
  // Read once, at mount: reopen THIS conversation, or start one.
  const chat = useCanvasWorkspaceConversation(
    surfaceKey,
    savedId
      ? { kind: "open", conversationId: savedId }
      : chosenAgentId
        ? { kind: "agent", agentId: chosenAgentId }
        : { kind: "new" },
  );
  const conversationId = chat.conversationId;

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
  return (
    <CanvasChatColumn
      conversation={chat.conversation}
      surfaceKey={surfaceKey}
      onSelectAgent={chat.startWith}
      className="bg-card"
    />
  );
}

/** Stable empty list: `agentIds: []` = every conversation the person can open. */
const ALL_AGENTS: string[] = [];

function ChatPicker({ onPick, onCancel }: PickerProps) {
  const [mode, setMode] = useState<"conversations" | "agent">("conversations");
  return (
    <div className="flex h-[520px] min-h-0 flex-col gap-2">
      <div className="flex shrink-0 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="Chat source">
        {(
          [
            { id: "conversations", label: "Your conversations", Icon: MessagesSquare },
            { id: "agent", label: "New chat with an agent", Icon: AGENT_ICON },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
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
        {mode === "conversations" ? (
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
        ) : (
          <AgentListInlinePicker
            consumerId="spatial-board-chat-agent"
            defaultMandateKey={DEFAULT_NEW_CHAT_MANDATE_KEY}
            className="h-full"
            onSelect={(agentId) =>
              onPick([{ title: "Chat", source: { kind: "entity", entity: "chat", id: null, meta: { agentId } } }])
            }
          />
        )}
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

function NoteBody({ source, onSource }: ItemBodyProps) {
  if (!isEntity(source, "note")) return null;
  return (
    <NoteTileBody
      noteId={source.id}
      initialText={noteSeed(source) ?? ""}
      onCreated={(noteId, label) => onSource(noteSource(source, noteId), label)}
    />
  );
}

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

function FileBody({ source }: ItemBodyProps) {
  const fileId = fileIdOf(source);
  if (!fileId) {
    return (
      <div className="flex h-full items-center justify-center bg-card p-4 text-xs text-muted-foreground">
        This file tile has no file yet. Remove it and add the file again.
      </div>
    );
  }
  return (
    <div data-spatial-scroll className="h-full min-h-0 overflow-auto bg-card">
      <FilePreview fileId={fileId} className="h-full" />
    </div>
  );
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
    startNew: {
      label: "Chat",
      create: (): PlacedItem => ({ title: "Chat", source: chatSource(null, null) }),
    },
    bringIn: { label: "Chat or agent", Picker: ChatPicker },
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
    defaultSize: { w: 420, h: 360 },
    matches: (s) => isEntity(s, "note"),
    Body: NoteBody,
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
    surface: { name: "matrx-user/files" },
    label: "File",
    icon: FileIcon,
    group: "work",
    defaultSize: { w: 640, h: 560 },
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
