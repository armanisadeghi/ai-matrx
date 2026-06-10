"use client";

/**
 * CleanupSessionList — recents rail for cleanup sessions.
 *
 * Compact list rows (title + time-ago), active highlight with a primary
 * accent bar, hover-revealed delete. A scope toggle widens the list from
 * this surface's own sessions ("Cleanup") to every session RLS lets the
 * user see ("All" — studio sessions + shared/org/public sessions from other
 * users); non-cleanup rows carry an origin badge.
 */

import React from "react";
import { AudioLines, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import ActionFeedbackButton from "@/components/official/ActionFeedbackButton";
import type { StudioSession } from "@/features/transcript-studio/types";

interface CleanupSessionListProps {
  sessions: StudioSession[];
  fetchStatus: "idle" | "loading" | "ready" | "error";
  activeSessionId: string | null;
  scope: "cleanup" | "all";
  onScopeChange: (scope: "cleanup" | "all") => void;
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
  scope,
  onScopeChange,
  onSelect,
  onCreate,
  onDelete,
}: CleanupSessionListProps) {
  return (
    <div className="flex flex-col">
      <div className="mb-1.5 flex items-center justify-between gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Sessions
        </span>
        <div className="flex items-center gap-1">
          {/* Scope: this surface only vs everything visible to the user */}
          <div className="flex items-center rounded-md border border-border p-0.5">
            {(["cleanup", "all"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onScopeChange(s)}
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium capitalize transition-colors",
                  scope === s
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {s === "cleanup" ? "Mine" : "All"}
              </button>
            ))}
          </div>
          <ActionFeedbackButton
            icon={<Plus className="h-3.5 w-3.5" />}
            tooltip="New session"
            onClick={onCreate}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
          />
        </div>
      </div>

      {fetchStatus === "loading" && sessions.length === 0 ? (
        <div className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading sessions…
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-4 text-center">
          <AudioLines className="h-4 w-4 text-primary/60" />
          <span className="text-xs leading-relaxed text-muted-foreground">
            {scope === "cleanup"
              ? "Record or type a transcript — a session is created automatically."
              : "Nothing visible yet across surfaces."}
          </span>
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
                    "flex w-full flex-col items-start gap-0.5 rounded-md border-l-2 px-2 py-1.5 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-transparent text-foreground/90 hover:bg-accent/60",
                  )}
                >
                  <span className="w-full truncate pr-6 text-xs font-medium leading-snug">
                    {s.title}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    {timeAgo(s.updatedAt)}
                    {s.source !== "cleanup" && (
                      <span className="rounded bg-muted px-1 py-px font-medium text-muted-foreground">
                        {s.source}
                      </span>
                    )}
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
