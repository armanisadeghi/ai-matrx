"use client";

import { useEffect, useState } from "react";
import {
  ChevronRight,
  Inbox,
  Loader2,
  Mic,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectAllSessions,
  selectFetchStatus,
  selectUnsortedCount,
} from "../../redux/selectors";
import {
  createSessionThunk,
  deleteSessionThunk,
  fetchSessionsThunk,
  fetchUnsortedRecordingsThunk,
  updateSessionThunk,
} from "../../redux/thunks";
import { ActionSheet, type ActionSheetItem } from "./ActionSheet";
import { SwipeableRow, type SwipeAction } from "./SwipeableRow";

interface MobileSessionsListProps {
  onOpenSession: (sessionId: string) => void;
  onOpenUnsorted: () => void;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diff = now - d.getTime();
  const day = 86_400_000;
  if (diff < day && d.getDate() === new Date().getDate()) {
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  if (diff < 7 * day) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function MobileSessionsList({
  onOpenSession,
  onOpenUnsorted,
}: MobileSessionsListProps) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const sessions = useAppSelector(selectAllSessions);
  const fetchStatus = useAppSelector(selectFetchStatus);
  const unsortedCount = useAppSelector(selectUnsortedCount);
  const [creating, setCreating] = useState(false);
  const [menuSessionId, setMenuSessionId] = useState<string | null>(null);
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);

  const menuSession = sessions.find((s) => s.id === menuSessionId) ?? null;
  const renameSession = sessions.find((s) => s.id === renameSessionId) ?? null;

  const confirmDelete = async (sessionId: string, title: string) => {
    const ok = await confirm({
      title: `Delete "${title || "Session"}"?`,
      description:
        "This removes the session and its recordings from your list.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (ok) void dispatch(deleteSessionThunk(sessionId));
  };

  const menuItems: ActionSheetItem[] = menuSession
    ? [
        {
          key: "open",
          label: "Open session",
          icon: <Mic className="h-4 w-4" />,
          onSelect: () => onOpenSession(menuSession.id),
        },
        {
          key: "rename",
          label: "Rename",
          icon: <Pencil className="h-4 w-4" />,
          onSelect: () => setRenameSessionId(menuSession.id),
        },
        {
          key: "delete",
          label: "Delete",
          icon: <Trash2 className="h-4 w-4" />,
          destructive: true,
          onSelect: () => void confirmDelete(menuSession.id, menuSession.title),
        },
      ]
    : [];

  useEffect(() => {
    if (fetchStatus === "idle") void dispatch(fetchSessionsThunk());
    void dispatch(fetchUnsortedRecordingsThunk());
  }, [fetchStatus, dispatch]);

  const handleCreate = async () => {
    if (!userId || creating) return;
    setCreating(true);
    try {
      const result = await dispatch(
        createSessionThunk({ userId, activate: true }),
      ).unwrap();
      onOpenSession(result.id);
    } catch {
      // toast surfaced by the thunk
    } finally {
      setCreating(false);
    }
  };

  const deleteAction = (sessionId: string, title: string): SwipeAction => ({
    key: "delete",
    label: "Delete",
    icon: <Trash2 className="h-5 w-5" />,
    className: "bg-destructive text-destructive-foreground",
    onAction: () => void confirmDelete(sessionId, title),
  });

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-textured">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-card/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex h-12 items-center">
          <h1 className="text-base font-semibold text-foreground">Sessions</h1>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={!userId || creating}
          className="flex h-9 items-center gap-1.5 rounded-full bg-primary px-3 text-sm font-medium text-primary-foreground active:bg-primary/90 disabled:opacity-50"
        >
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          New
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        {/* Unsorted pool entry */}
        {unsortedCount > 0 && (
          <button
            type="button"
            onClick={onOpenUnsorted}
            className="mb-3 flex w-full items-center gap-3 rounded-xl border border-border bg-card p-3 text-left active:bg-accent"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Inbox className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                Unsorted
              </span>
              <span className="block text-xs text-muted-foreground">
                {unsortedCount} recording{unsortedCount === 1 ? "" : "s"} not in a
                session
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </button>
        )}

        {fetchStatus === "loading" && sessions.length === 0 ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              No sessions yet. Tap “New” to start a recording session.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {sessions.map((s) => (
              <SwipeableRow
                key={s.id}
                trailingActions={[deleteAction(s.id, s.title)]}
              >
                <div className="flex w-full items-center border border-border bg-card active:bg-accent">
                  <button
                    type="button"
                    onClick={() => onOpenSession(s.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Mic className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">
                        {s.title || "Untitled session"}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {formatWhen(s.updatedAt)}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuSessionId(s.id);
                    }}
                    aria-label="Session options"
                    className="mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-accent"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </div>
              </SwipeableRow>
            ))}
          </div>
        )}
      </div>

      <ActionSheet
        open={menuSessionId !== null}
        onOpenChange={(o) => {
          if (!o) setMenuSessionId(null);
        }}
        title={menuSession?.title || "Session"}
        items={menuItems}
      />
      <TextInputDialog
        open={renameSessionId !== null}
        onOpenChange={(o) => {
          if (!o) setRenameSessionId(null);
        }}
        title="Rename session"
        defaultValue={renameSession?.title ?? ""}
        confirmLabel="Save"
        onConfirm={(value) => {
          if (renameSessionId) {
            void dispatch(
              updateSessionThunk({
                id: renameSessionId,
                patch: { title: value.trim() },
              }),
            );
          }
        }}
      />
    </div>
  );
}
