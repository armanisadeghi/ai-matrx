"use client";

import React, { useState, useEffect, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Link,
  Music,
  CheckCircle2,
  Circle,
  Clock,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShowForm } from "./PodcastForm";
import { podcastService } from "../../service";
import type { PcShow, PcEpisodeWithShow } from "../../types";
import { InlineMediaRef } from "@/features/files";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard
          .writeText(`${window.location.origin}/podcast/${slug}`)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          });
      }}
      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
      title={copied ? "Copied!" : "Copy public link"}
    >
      <Link className="h-3.5 w-3.5" />
    </button>
  );
}

interface ShowDetailClientProps {
  /** Pass 'new' to create a new show, or the show's UUID to edit */
  showId: string;
}

export function ShowDetailClient({ showId }: ShowDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const isNew = showId === "new";

  const [show, setShow] = useState<PcShow | null>(null);
  const [episodes, setEpisodes] = useState<PcEpisodeWithShow[]>([]);
  const [isLoading, setIsLoading] = useState(!isNew);
  const [pendingDeleteEpId, setPendingDeleteEpId] = useState<string | null>(
    null,
  );
  const [isDeletingEp, setIsDeletingEp] = useState(false);

  // URL param: which panel is active — 'show' (edit show) or null (episodes list)
  const panel = searchParams.get("panel") ?? "show";

  const setPanel = (value: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("panel", value);
      router.replace(
        `/administration/podcasts/shows/${showId}?${params.toString()}`,
      );
    });
  };

  const load = async () => {
    if (isNew) return;
    setIsLoading(true);
    try {
      const [foundShow, allEps] = await Promise.all([
        podcastService.fetchShowById(showId),
        podcastService.fetchEpisodesForShow(showId),
      ]);
      setShow(foundShow);
      setEpisodes(allEps);
    } catch (e) {
      console.error("Failed to load show", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [showId]);

  const handleShowSaved = (saved: PcShow) => {
    setShow(saved);
    // After creating a new show, redirect to its real route
    if (isNew) {
      startTransition(() =>
        router.replace(`/administration/podcasts/shows/${saved.id}?panel=show`),
      );
    }
  };

  const handleDeleteEpConfirm = async () => {
    if (!pendingDeleteEpId) return;
    setIsDeletingEp(true);
    try {
      await podcastService.removeEpisode(pendingDeleteEpId);
      setEpisodes((prev) => prev.filter((e) => e.id !== pendingDeleteEpId));
    } catch (e) {
      console.error("Delete failed", e);
    } finally {
      setIsDeletingEp(false);
      setPendingDeleteEpId(null);
    }
  };

  const back = () =>
    startTransition(() => router.push("/administration/podcasts/shows"));

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
        <button
          onClick={back}
          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          title="Back to shows"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <InlineMediaRef
          ref={show?.image_url ?? null}
          size={{ width: 32, height: 32 }}
          fit="cover"
          rounded="md"
          fallback={null}
          className="shrink-0"
          alt=""
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-semibold text-sm truncate">
            {isNew ? "New Show" : (show?.title ?? "Loading…")}
          </h1>
          {show?.slug && (
            <p className="text-xs text-muted-foreground font-mono truncate">
              /podcast/{show.slug}
            </p>
          )}
        </div>
        {show && (
          <div className="flex items-center gap-1 shrink-0">
            <CopyLinkButton slug={show.slug} />
          </div>
        )}
        {isPending && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Sub-tabs: only shown when editing an existing show */}
      {!isNew && (
        <div className="flex items-center gap-1 px-4 pt-2 border-b bg-background shrink-0">
          {(["show", "episodes"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setPanel(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors capitalize ${
                panel === tab
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {tab === "show"
                ? "Show Settings"
                : `Episodes (${episodes.length})`}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : panel === "show" || isNew ? (
          /* Show form */
          <div className="p-4 max-w-2xl">
            <ShowForm
              show={show}
              isNew={isNew}
              onSaved={handleShowSaved}
              onCancel={back}
            />
          </div>
        ) : (
          /* Episodes list */
          <div className="flex flex-col h-full min-h-0">
            <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0">
              <p className="text-sm text-muted-foreground">
                {episodes.length === 0
                  ? "No episodes yet"
                  : `${episodes.length} episode${episodes.length === 1 ? "" : "s"}`}
              </p>
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={() =>
                  startTransition(() =>
                    router.push(
                      `/administration/podcasts/shows/${showId}/episodes/new`,
                    ),
                  )
                }
              >
                <Plus className="h-3.5 w-3.5" />
                New Episode
              </Button>
            </div>

            {episodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 text-muted-foreground py-20">
                <Music className="h-12 w-12 opacity-20" />
                <p className="text-sm">No episodes for this show yet.</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    startTransition(() =>
                      router.push(
                        `/administration/podcasts/shows/${showId}/episodes/new`,
                      ),
                    )
                  }
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Create first episode
                </Button>
              </div>
            ) : (
              <div className="divide-y overflow-y-auto flex-1">
                {episodes.map((ep) => (
                  <div
                    key={ep.id}
                    className="flex items-center gap-3 px-4 py-3 group hover:bg-muted/40 cursor-pointer transition-colors"
                    onClick={() =>
                      startTransition(() =>
                        router.push(
                          `/administration/podcasts/shows/${showId}/episodes/${ep.id}`,
                        ),
                      )
                    }
                  >
                    {/* Thumbnail */}
                    <InlineMediaRef
                      ref={(ep.thumbnail_url ?? ep.image_url) ?? null}
                      size={{ width: 40, height: 40 }}
                      fit="cover"
                      rounded="lg"
                      fallbackIcon={<Music className="h-4 w-4 text-muted-foreground" />}
                      className="shrink-0"
                      alt=""
                    />

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {ep.episode_number != null && (
                          <span className="text-xs text-muted-foreground shrink-0">
                            Ep {ep.episode_number}
                          </span>
                        )}
                        <p className="font-medium text-sm truncate">
                          {ep.title}
                        </p>
                        {ep.is_published ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                        ) : (
                          <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        )}
                        {!ep.og_image_url && (
                          <AlertTriangle
                            className="h-3.5 w-3.5 text-warning shrink-0"
                            aria-label="No OG image — shares won't show a preview"
                          />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs font-mono text-muted-foreground px-1 rounded bg-muted">
                          {ep.display_mode}
                        </span>
                        {ep.duration_seconds != null && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
                            <Clock className="h-3 w-3" />
                            {formatDuration(ep.duration_seconds)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <CopyLinkButton slug={ep.slug} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startTransition(() =>
                            router.push(
                              `/administration/podcasts/shows/${showId}/episodes/${ep.id}`,
                            ),
                          );
                        }}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDeleteEpId(ep.id);
                        }}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AlertDialog
        open={!!pendingDeleteEpId}
        onOpenChange={(open) => !open && setPendingDeleteEpId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete episode?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingEp}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteEpConfirm}
              disabled={isDeletingEp}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isDeletingEp ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
