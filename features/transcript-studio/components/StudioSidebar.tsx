"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronsLeft, Loader2, Mic, Pencil, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectActiveSessionId,
  selectAllSessions,
  selectFetchStatus,
} from "../redux/selectors";
import { activeSessionIdSet } from "../redux/slice";
import {
  createSessionThunk,
  deleteSessionThunk,
  fetchSessionsThunk,
  updateSessionThunk,
} from "../redux/thunks";
import { NEW_SESSION_DEFAULT_TITLE } from "../constants";
import type { StudioSession } from "../types";

interface StudioSidebarProps {
  className?: string;
  onPickSession?: (sessionId: string) => void;
  onCreateSession?: (sessionId: string) => void;
  /** When provided, session pick/create updates the page URL (`?session=`). */
  navigateToSession?: (sessionId: string | null) => void;
  /** When provided, renders a collapse toggle in the header. */
  onCollapse?: () => void;
}

export function StudioSidebar({
  className,
  onPickSession,
  onCreateSession,
  navigateToSession,
  onCollapse,
}: StudioSidebarProps) {
  const dispatch = useAppDispatch();
  const sessions = useAppSelector(selectAllSessions);
  const activeSessionId = useAppSelector(selectActiveSessionId);
  const fetchStatus = useAppSelector(selectFetchStatus);
  const userId = useAppSelector(selectUserId);

  // Hydration gate. Server-rendered output uses the EMPTY initial Redux
  // store (StudioHydrator's seeds are dispatched in a useEffect, after
  // mount). The client's first render must match — so we render the
  // loading shell on both server and the first client render, then flip
  // to the real content after hydration. Without this, the
  // empty-state-div ↔ session-list-ul element-type swap trips React's
  // hydration mismatch warning, which `suppressHydrationWarning` can't
  // suppress because it doesn't cover divergent element types.
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);

  const handlePick = (id: string) => {
    if (navigateToSession) {
      navigateToSession(id);
    } else {
      dispatch(activeSessionIdSet(id));
    }
    onPickSession?.(id);
  };

  const handleCreate = async () => {
    if (!userId) return;
    const result = await dispatch(
      createSessionThunk({
        userId,
        activate: !navigateToSession,
      }),
    );
    if (createSessionThunk.fulfilled.match(result) && result.payload?.id) {
      navigateToSession?.(result.payload.id);
      onCreateSession?.(result.payload.id);
    }
  };

  const handleRetry = () => {
    void dispatch(fetchSessionsThunk());
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col border-r border-border bg-textured",
        className,
      )}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
          <Mic className="h-4 w-4 shrink-0 text-primary" />
          Sessions
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!userId}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
              userId
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!isHydrated ? (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : fetchStatus === "loading" && sessions.length === 0 ? (
          <div className="flex items-center justify-center p-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : fetchStatus === "error" ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            <p>Could not load sessions.</p>
            <button
              type="button"
              onClick={handleRetry}
              className="mt-2 text-primary underline-offset-2 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="px-3 py-4 text-xs text-muted-foreground">
            No sessions yet. Press <span className="font-medium">New</span> to
            start your first one.
          </div>
        ) : (
          <ul className="flex flex-col py-1">
            {sessions.map((session) => (
              <SidebarItem
                key={session.id}
                session={session}
                isActive={session.id === activeSessionId}
                onPick={() => handlePick(session.id)}
                navigateToSession={navigateToSession}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

interface SidebarItemProps {
  session: StudioSession;
  isActive: boolean;
  onPick: () => void;
  navigateToSession?: (sessionId: string | null) => void;
}

function SidebarItem({
  session,
  isActive,
  onPick,
  navigateToSession,
}: SidebarItemProps) {
  const dispatch = useAppDispatch();
  const subtitle = formatSessionSubtitle(session);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(session.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!editing) setDraft(session.title);
  }, [session.title, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const startEdit = useCallback(() => {
    setDraft(session.title);
    setEditing(true);
  }, [session.title]);

  const commit = useCallback(() => {
    const next = draft.trim() || NEW_SESSION_DEFAULT_TITLE;
    setEditing(false);
    if (next === session.title) return;
    void dispatch(
      updateSessionThunk({ id: session.id, patch: { title: next } }),
    );
  }, [draft, session.title, session.id, dispatch]);

  return (
    <li
      className={cn(
        "group relative flex flex-col gap-0.5 border-l-2 py-2 pl-3 pr-3 text-left transition-colors",
        isActive
          ? "border-primary bg-primary/10"
          : "border-transparent hover:bg-accent/40",
        !editing && "cursor-pointer",
      )}
      onClick={() => {
        if (!editing) onPick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (editing) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onPick();
        }
      }}
    >
      <div className="flex min-w-0 items-center gap-1">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft(session.title);
                setEditing(false);
              }
            }}
            maxLength={120}
            aria-label="Rename session"
            className="min-w-0 flex-1 rounded-sm bg-background px-1 text-xs font-medium outline-none ring-1 ring-ring"
          />
        ) : (
          <>
            <span className="line-clamp-1 min-w-0 flex-1 text-xs font-medium">
              {session.title}
            </span>
            <div className="flex w-11 shrink-0 items-center justify-end gap-0.5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  startEdit();
                }}
                aria-label="Rename session"
                title="Rename"
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(true);
                }}
                aria-label="Delete session"
                title="Delete"
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </>
        )}
      </div>
      {!editing && (
        <span className="line-clamp-1 text-[10px] text-muted-foreground">
          {subtitle}
        </span>
      )}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete session?"
        description={
          <>
            Permanently remove <b>{session.title}</b> and all of its raw,
            cleaned, concept, and module data. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={() => {
          setConfirmDelete(false);
          void dispatch(deleteSessionThunk(session.id)).then(() => {
            if (isActive) {
              navigateToSession?.(null);
            }
          });
        }}
      />
    </li>
  );
}

function formatSessionSubtitle(session: StudioSession): string {
  const parts: string[] = [];
  if (session.status !== "idle" && session.status !== "stopped") {
    parts.push(session.status);
  }
  parts.push(timeAgo(session.updatedAt));
  if (session.moduleId && session.moduleId !== "tasks") {
    parts.push(session.moduleId);
  }
  return parts.join(" · ");
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}
