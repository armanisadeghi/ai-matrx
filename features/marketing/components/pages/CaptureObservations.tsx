"use client";

/**
 * CaptureObservations — the "what's wrong with this screenshot" layer for page
 * captures. Opens the capture LARGE beside an observation panel: write what's
 * broken / looks wrong / should change while looking at the image.
 *
 * Zero bespoke persistence: every observation is a real `workbench.notes` row
 * (created via the canonical notes service) attached to the `web_screenshot`
 * entity through the ONE association path (`useContainerLinks` →
 * platform.associations, note → web_screenshot edge, registered 2026-07-27).
 * "Broken — needs fix" flags ride note tags and spawn a task through the
 * existing task quick-create window (source = web_screenshot; canonical edge
 * direction entity → task — the window owns the write). The same notes appear
 * in the CaptureAttachments paperclip, /notes, and every other association
 * surface for free.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  ListTodo,
  MessageSquareText,
  StickyNote,
  TriangleAlert,
} from "lucide-react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { InlineMediaRef } from "@/features/files/components/inline/InlineMediaRef";
import { fileIdToMediaRef } from "@/features/files/redux/converters";
import { useOpenFilePreviewWindow } from "@/features/overlays/openers/filePreviewWindow";
import { useOpenNoteInfoWindow } from "@/features/overlays/openers/noteInfoWindow";
import { useOpenTaskQuickCreateWindow } from "@/features/overlays/openers/taskQuickCreateWindow";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import { createNote, fetchNotesByIds } from "@/features/notes/service/notesService";
import type { Note } from "@/features/notes/types";
import type { MarketingPage, SiteScreenshot } from "@/features/marketing/types";
import {
  formatDate,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

/** Note tag stamped on every capture observation (for /notes filtering). */
const OBSERVATION_TAG = "observation";
/** Note tag carried by observations flagged broken / needs fix. */
const NEEDS_FIX_TAG = "needs-fix";
/** Folder the observation notes land in on /notes. */
const OBSERVATION_FOLDER = "Page Observations";

function observationLabel(content: string): string {
  const firstLine = content.trim().split("\n")[0]?.trim() ?? "";
  if (!firstLine) return "Capture observation";
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

/**
 * The per-capture "Observations" affordance: count chip + the large-view
 * dialog. Rendered by PageCapturesCard beside CaptureAttachments.
 */
export function CaptureObservations({
  screenshot,
  kind,
  page,
  className,
}: {
  /** The capture row (must carry a non-null file_id to render large). */
  screenshot: SiteScreenshot & { file_id: string };
  /** Capture kind (desktop / mobile / …) — display + task labels. */
  kind: string;
  page: MarketingPage;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const links = useContainerLinks({
    containerType: "web_screenshot",
    containerId: screenshot.id,
    orgId: page.organization_id,
  });
  const noteCount = links.countFor("note");

  return (
    <>
      <button
        type="button"
        aria-label="View capture large and write observations"
        title="View large + write observations"
        onClick={() => setOpen(true)}
        className={cn(
          "flex h-6 shrink-0 items-center gap-1 rounded-md border border-border px-1.5 text-[10px] text-muted-foreground transition-colors hover:text-foreground",
          className,
        )}
      >
        <MessageSquareText className="h-3 w-3" />
        {noteCount > 0 ? noteCount : null}
      </button>
      {open ? (
        <CaptureObservationsDialog
          screenshot={screenshot}
          kind={kind}
          page={page}
          links={links}
          onOpenChange={setOpen}
        />
      ) : null}
    </>
  );
}

function CaptureObservationsDialog({
  screenshot,
  kind,
  page,
  links,
  onOpenChange,
}: {
  screenshot: SiteScreenshot & { file_id: string };
  kind: string;
  page: MarketingPage;
  links: ReturnType<typeof useContainerLinks>;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const openFilePreview = useOpenFilePreviewWindow();
  const openNoteInfo = useOpenNoteInfoWindow();
  const openTaskWindow = useOpenTaskQuickCreateWindow();

  const [draft, setDraft] = useState("");
  const [needsFix, setNeedsFix] = useState(false);
  const [saving, setSaving] = useState(false);

  // React Compiler handles memoization — plain derivation is correct here.
  const noteIds = [...links.attachedIdsFor("note")].sort();
  const notes = useQuery({
    queryKey: [
      "marketing",
      "capture-observations",
      screenshot.id,
      noteIds.join(","),
    ] as const,
    queryFn: () => fetchNotesByIds(noteIds),
    enabled: noteIds.length > 0,
  });

  const captureLabel = `${kind} capture — ${page.path || page.url}`;

  const openFixTask = (title: string, description: string) => {
    openTaskWindow({
      source: {
        entity_type: "web_screenshot",
        entity_id: screenshot.id,
        label: captureLabel,
      },
      prePopulate: {
        title,
        description,
        priority: "high",
      },
    });
  };

  const saveObservation = async () => {
    const content = draft.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      const note = await createNote({
        label: observationLabel(content),
        content,
        folder_name: OBSERVATION_FOLDER,
        tags: needsFix ? [OBSERVATION_TAG, NEEDS_FIX_TAG] : [OBSERVATION_TAG],
        metadata: {
          capture_observation: {
            screenshot_id: screenshot.id,
            capture_kind: kind,
            page_id: page.id,
            page_url: page.url,
          },
        },
        organization_id: page.organization_id,
        visibility: "internal",
      });
      const attached = await links.attach(
        "note",
        note.id,
        observationLabel(content),
      );
      if (!attached.ok) {
        // The note EXISTS but is not linked to the capture — say exactly that.
        toast.error("Observation saved but NOT attached to this capture", {
          description: `The note was created (find it in /notes under "${OBSERVATION_FOLDER}") but the association write failed: ${attached.error ?? "unknown error"}. Attach it manually via the paperclip.`,
          duration: 12000,
        });
        return;
      }
      setDraft("");
      const flagged = needsFix;
      setNeedsFix(false);
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "capture-observations", screenshot.id],
      });
      toast.success("Observation saved");
      if (flagged) {
        openFixTask(
          observationLabel(content),
          `${content}\n\nCapture: ${captureLabel}\nPage: ${page.url}`,
        );
      }
    } catch (error) {
      toast.error("Could not save observation", {
        description: extractErrorMessage(error),
      });
    } finally {
      setSaving(false);
    }
  };

  const rows: Note[] = notes.data ?? [];

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-3 overflow-hidden sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm capitalize">
            <MessageSquareText className="h-4 w-4" />
            {kind} capture observations
          </DialogTitle>
          <DialogDescription className="truncate text-xs">
            {page.url} · as of {formatDate(screenshot.captured_at)}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-3 overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Large capture view — canonical media ref, full viewer one click away. */}
          <div className="flex min-h-0 flex-col gap-1.5">
            <div className="relative min-h-[240px] flex-1 overflow-auto rounded-lg border border-border bg-muted/40">
              <InlineMediaRef
                ref={fileIdToMediaRef(screenshot.file_id, "image/png")}
                size="fill"
                fit="contain"
                rounded="none"
                fallback="icon"
                errorFallback="icon"
                alt={`${kind} capture of ${page.url}`}
              />
            </div>
            <button
              type="button"
              onClick={() => openFilePreview({ fileId: screenshot.file_id })}
              className="inline-flex items-center gap-1.5 self-start text-[11px] text-muted-foreground transition-colors hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
              Open in file viewer
            </button>
          </div>

          {/* Observation panel — composer + attached observation notes. */}
          <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="What's broken, wrong, or should change on this capture?"
              rows={4}
              autoFocus
              className="resize-none text-sm"
            />
            <div className="flex items-center justify-between gap-2">
              <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                <Switch
                  checked={needsFix}
                  onCheckedChange={setNeedsFix}
                  aria-label="Broken — needs fix (spawns a task on save)"
                />
                <TriangleAlert
                  className={cn(
                    "h-3.5 w-3.5",
                    needsFix ? "text-warning" : "text-muted-foreground/60",
                  )}
                />
                Broken — needs fix
              </label>
              <Button
                size="sm"
                onClick={() => void saveObservation()}
                disabled={!draft.trim() || saving}
              >
                {saving
                  ? "Saving…"
                  : needsFix
                    ? "Save + create task"
                    : "Save observation"}
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border">
              {links.status === "error" && links.error ? (
                <p className="p-3 text-xs text-destructive">
                  Could not load attached observations: {links.error}
                </p>
              ) : notes.isError ? (
                <QueryError
                  error={notes.error}
                  onRetry={() => void notes.refetch()}
                />
              ) : noteIds.length === 0 ? (
                <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
                  <StickyNote className="h-3.5 w-3.5" />
                  No observations yet — write the first one above.
                </p>
              ) : notes.isLoading ? (
                <div className="m-3 h-16 animate-pulse rounded-md border border-border bg-muted/40" />
              ) : (
                <ul className="divide-y divide-border">
                  {rows.map((note) => {
                    const flagged = (note.tags ?? []).includes(NEEDS_FIX_TAG);
                    return (
                      <li key={note.id} className="grid gap-1 p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                            {flagged ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded border border-warning/40 bg-warning/10 px-1 py-px text-[10px] text-warning">
                                <TriangleAlert className="h-3 w-3" />
                                needs fix
                              </span>
                            ) : null}
                            <span className="truncate">
                              {formatDate(note.created_at)}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              title="Create a fix task from this observation"
                              aria-label="Create a fix task from this observation"
                              onClick={() =>
                                openFixTask(
                                  note.label ?? "Fix capture issue",
                                  `${note.content ?? ""}\n\nCapture: ${captureLabel}\nPage: ${page.url}`,
                                )
                              }
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                            >
                              <ListTodo className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              title="Open note"
                              aria-label="Open note"
                              onClick={() =>
                                openNoteInfo({
                                  noteId: note.id,
                                  title: note.label,
                                })
                              }
                              className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap text-xs text-foreground">
                          {note.content?.trim() || note.label || "(empty note)"}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
