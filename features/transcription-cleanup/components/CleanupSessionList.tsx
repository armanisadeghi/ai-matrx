"use client";

/**
 * CleanupSessionList — recents rail for cleanup sessions.
 *
 * Compact list rows (title + time-ago), active highlight, hover-revealed
 * delete. Sessions are studio_sessions rows with source='cleanup'.
 */

import React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import ActionFeedbackButton from "@/components/official/ActionFeedbackButton";
import type { StudioSession } from "@/features/transcript-studio/types";

interface CleanupSessionListProps {
  sessions: StudioSession[];
  fetchStatus: "idle" | "loading" | "ready" | "error";
  activeSessionId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
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

export function CleanupSessionList({
  sessions,
  fetchStatus,
  activeSessionId,
  onSelect,
  onCreate,
  onDelete,
}: CleanupSessionListProps) {
  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sessions
        </span>
        <ActionFeedbackButton
          icon={<Plus className="h-3.5 w-3.5" />}
          tooltip="New session"
          onClick={onCreate}
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
        />
      </div>

      {fetchStatus === "loading" && sessions.length === 0 ? (
        <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading sessions…
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-md border border-dashed border-border px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          No sessions yet. Record or type a transcript and a session is created
          automatically.
        </div>
      ) : (
        <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto pr-0.5">
          {sessions.map((s) => {
            const active = s.id === activeSessionId;
            return (
              <li key={s.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
                    active
                      ? "bg-primary/10 text-foreground"
                      : "hover:bg-accent/60 text-foreground/90",
                  )}
                >
                  <span className="w-full truncate pr-6 text-xs font-medium leading-snug">
                    {s.title}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {timeAgo(s.updatedAt)}
                  </span>
                </button>
                <span className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100">
                  <ActionFeedbackButton
                    icon={<Trash2 className="h-3 w-3" />}
                    tooltip="Delete session"
                    onClick={async () => {
                      const ok = await confirm({
                        title: "Delete this session?",
                        description:
                          "The session and its transcript, cleaned text, and custom output will be removed.",
                        confirmLabel: "Delete",
                        variant: "destructive",
                      });
                      if (ok) onDelete(s.id);
                    }}
                    className="h-5 w-5 text-muted-foreground/60 hover:text-destructive"
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
