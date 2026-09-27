"use client";

// features/meet/components/record/RecordingsLibrary.tsx
//
// /meetings?tab=recordings — EVERY RECORDING OF THE READER'S OWN MEETINGS
// (Meet wave 3; Zoom's Recordings tab, Google's Drive "Meet Recordings"
// folder). One row per recording: its honest state (processing / ready /
// failed / expired), length and size; play it in place, download it, share
// the file through the platform share system, rename, archive (never purge),
// open the meeting's record.
//
// The read is `meet_my_recordings` — scoped to meetings the reader hosts, is
// invited to, or attended (RLS is the ceiling, never the view).

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Download,
  FileText,
  MoreHorizontal,
  Pencil,
  Play,
  Share2,
  Video,
  X,
} from "lucide-react";
import {
  createMeetRepository,
  useMeetHost,
  type LibraryRecording,
} from "@ai-matrx/meet/react";
import {
  ArchiveFilter,
  DEFAULT_ARCHIVE_FILTER,
  Skeleton,
  type ArchiveFilterValue,
} from "@ai-matrx/design-system";
import { formatDurationMs } from "@ai-matrx/kit/format";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { ShareModal } from "@/features/sharing/components/ShareModal";
import { downloadMediaSource } from "@/features/files/media-client/download";
import { supabase } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { errorSentence } from "@/features/meet/hooks/useMeetingActions";
import { RecordingSeekPlayer } from "@/features/meet/components/record/RecordingSeekPlayer";
import { fileSafe } from "@/features/meet/components/record/AttendancePanel";

const STATE: Record<
  LibraryRecording["state"],
  { label: string; tone: string } | null
> = {
  available: null,
  idle: { label: "Not started", tone: "bg-muted text-muted-foreground" },
  starting: {
    label: "Starting",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  recording: {
    label: "Recording",
    tone: "bg-red-500/15 text-red-700 dark:text-red-300",
  },
  stopping: {
    label: "Processing",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  processing: {
    label: "Processing",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  expired: { label: "Expired", tone: "bg-muted text-muted-foreground" },
  failed: { label: "Failed", tone: "bg-destructive/10 text-destructive" },
};

function nameOf(r: LibraryRecording): string {
  return r.title ?? r.meetingTitle;
}

function when(iso: string | null): string {
  if (!iso) return "Time not recorded";
  const at = new Date(iso);
  return at.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year:
      at.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function size(bytes: number | null): string | null {
  if (bytes === null) return null;
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

const FIRST_PLAY = { ms: 0, nonce: 1 };

export function RecordingsLibrary({ query }: { query: string }) {
  const router = useRouter();
  const host = useMeetHost();
  const [plain] = useState(() => createMeetRepository({ client: supabase }));
  const repository = host?.repository ?? plain;
  const [archive, setArchive] = useState<ArchiveFilterValue>(
    DEFAULT_ARCHIVE_FILTER,
  );
  const [rows, setRows] = useState<readonly LibraryRecording[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<LibraryRecording | null>(null);
  const [sharing, setSharing] = useState<LibraryRecording | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    let live = true;
    repository
      .myRecordings({ includeArchived: archive !== "active" })
      .then((next) => {
        if (!live) return;
        setRows(next);
        setFailure(null);
      })
      .catch((thrown: unknown) => {
        if (live) setFailure(errorSentence(thrown));
      });
    return () => {
      live = false;
    };
  }, [repository, archive, nonce]);

  const reload = () => setNonce((n) => n + 1);
  const needle = query.trim().toLowerCase();
  const visible = (rows ?? []).filter((r) => {
    if (archive === "archived" && r.archivedAt === null) return false;
    if (archive === "active" && r.archivedAt !== null) return false;
    return (
      !needle ||
      nameOf(r).toLowerCase().includes(needle) ||
      r.meetingTitle.toLowerCase().includes(needle)
    );
  });

  const setArchived = async (r: LibraryRecording, archived: boolean) => {
    try {
      await repository.setRecordingArchived(r.id, archived);
      toast.success(
        archived
          ? "Recording archived. Find it under Archived."
          : "Recording restored.",
      );
      reload();
    } catch (thrown) {
      toast.error(errorSentence(thrown));
    }
  };

  const openRecord = (r: LibraryRecording) =>
    startTransition(() => router.push(`/meetings/${r.meetingId}?tab=record`));

  return (
    <div className="mt-2 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {rows === null
            ? " "
            : `${visible.length} recording${visible.length === 1 ? "" : "s"}`}
        </p>
        <ArchiveFilter value={archive} onValueChange={setArchive} size="sm" />
      </div>

      {failure ? (
        <div
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm"
        >
          <p className="font-medium">Your recordings could not be listed.</p>
          <p className="mt-1 text-muted-foreground">{failure}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={reload}>
            Try again
          </Button>
        </div>
      ) : rows === null ? (
        <div
          className="space-y-2"
          aria-busy="true"
          aria-label="Loading your recordings"
        >
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {needle
            ? "No recording matches that search."
            : archive === "archived"
              ? "Nothing archived. Archiving a recording takes it off this list without deleting the file."
              : "No recordings yet. Start one from the meeting's control bar; everyone in the room is told when it starts."}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {visible.map((r) => {
            const state = STATE[r.state];
            const fileId = r.fileId;
            const canPlay = r.state === "available" && fileId !== null;
            const canEdit = r.role === "host" || r.role === "cohost";
            const detail = [
              when(r.startedAt),
              r.durationMs !== null
                ? formatDurationMs(r.durationMs, { style: "compact" })
                : null,
              size(r.sizeBytes),
            ].filter(Boolean);
            return (
              <li key={r.id} className={cn(r.archivedAt && "opacity-70")}>
                <div className="flex items-center gap-3 px-3 py-2">
                  <button
                    type="button"
                    disabled={!canPlay}
                    onClick={() => setPlaying(playing === r.id ? null : r.id)}
                    className="flex h-9 w-14 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground disabled:opacity-60"
                    aria-label={
                      canPlay
                        ? `Play ${nameOf(r)}`
                        : `${nameOf(r)} cannot be played yet`
                    }
                  >
                    {canPlay ? (
                      <Play className="h-4 w-4" />
                    ) : (
                      <Video className="h-4 w-4" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm font-medium">
                      <span className="truncate">{nameOf(r)}</span>
                      {state ? (
                        <span
                          className={cn(
                            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
                            state.tone,
                          )}
                        >
                          {state.label}
                        </span>
                      ) : null}
                      {r.archivedAt ? (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          Archived
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.title ? `${r.meetingTitle} · ` : ""}
                      {detail.join(" · ")}
                      {r.state === "failed" && r.failureReason
                        ? ` · ${r.failureReason}`
                        : ""}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="hidden h-8 gap-1 px-2 text-xs sm:inline-flex"
                    onClick={() => openRecord(r)}
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />{" "}
                    Record
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        aria-label={`Actions for ${nameOf(r)}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      {canPlay ? (
                        <DropdownMenuItem onSelect={() => setPlaying(r.id)}>
                          <Play className="h-4 w-4" aria-hidden="true" /> Play
                        </DropdownMenuItem>
                      ) : null}
                      <DropdownMenuItem onSelect={() => openRecord(r)}>
                        <FileText className="h-4 w-4" aria-hidden="true" /> Open
                        the meeting record
                      </DropdownMenuItem>
                      {canPlay && fileId !== null ? (
                        <>
                          <DropdownMenuItem
                            onSelect={() =>
                              void downloadMediaSource(
                                { kind: "file_id", fileId },
                                `${fileSafe(nameOf(r))}.mp4`,
                              ).catch((thrown: unknown) =>
                                toast.error(errorSentence(thrown)),
                              )
                            }
                          >
                            <Download className="h-4 w-4" aria-hidden="true" />{" "}
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setSharing(r)}>
                            <Share2 className="h-4 w-4" aria-hidden="true" />{" "}
                            Share…
                          </DropdownMenuItem>
                        </>
                      ) : null}
                      {canEdit ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => setRenaming(r)}>
                            <Pencil className="h-4 w-4" aria-hidden="true" />{" "}
                            Rename…
                          </DropdownMenuItem>
                          {r.archivedAt ? (
                            <DropdownMenuItem
                              onSelect={() => void setArchived(r, false)}
                            >
                              <ArchiveRestore
                                className="h-4 w-4"
                                aria-hidden="true"
                              />{" "}
                              Restore
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onSelect={() => void setArchived(r, true)}
                            >
                              <Archive className="h-4 w-4" aria-hidden="true" />{" "}
                              Archive
                            </DropdownMenuItem>
                          )}
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                {playing === r.id && fileId !== null ? (
                  <div className="relative border-t border-border bg-muted/20 p-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute right-4 top-4 z-10 h-7 w-7 bg-background/80"
                      onClick={() => setPlaying(null)}
                      aria-label="Close the player"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                    <div className="mx-auto max-w-3xl">
                      <RecordingSeekPlayer fileId={fileId} seek={FIRST_PLAY} />
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {renaming ? (
        <TextInputDialog
          open
          onOpenChange={(open) => (!open ? setRenaming(null) : undefined)}
          title="Rename recording"
          description="Leave it empty to go back to the meeting's title."
          defaultValue={renaming.title ?? renaming.meetingTitle}
          confirmLabel="Rename"
          validate={() => null}
          onConfirm={async (value) => {
            try {
              const next = value.trim();
              await repository.renameRecording(
                renaming.id,
                next === "" || next === renaming.meetingTitle ? null : next,
              );
              toast.success("Renamed.");
              setRenaming(null);
              reload();
            } catch (thrown) {
              toast.error(errorSentence(thrown));
            }
          }}
        />
      ) : null}
      {sharing && sharing.fileId ? (
        <ShareModal
          isOpen
          onClose={() => setSharing(null)}
          resourceType="file"
          resourceId={sharing.fileId}
          resourceName={nameOf(sharing)}
          organizationId={sharing.organizationId}
        />
      ) : null}
    </div>
  );
}
