"use client";

import React, { useState, useMemo } from "react";
import { idMatchesQuery } from "@ai-matrx/kit/search-scoring";
import {
  Plus,
  RefreshCw,
  Search,
  Pencil,
  Trash2,
  Link,
  Mic,
  Music,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import {
  MatrxDataTable,
  type MatrxColumnDef,
} from "@ai-matrx/design-system/data-table";
import { InlineMediaRef } from "@ai-matrx/media/react";
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
import type { PcShow, PcEpisodeWithShow } from "../../types";
import { podcastService } from "../../service";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import { keyFieldsAiVariant } from "@/features/marketing/lib/copy-payloads";
import {
  episodeAgentData,
  episodeProjection,
  episodeRowSummary,
  episodesExportRows,
  episodesHumanSummary,
  showAgentData,
  showProjection,
  showRowSummary,
  showsExportRows,
  showsHumanSummary,
} from "@/features/podcasts/utils/copy-format";

interface PodcastsTableProps {
  activeTab: "shows" | "episodes";
  shows: PcShow[];
  episodes: PcEpisodeWithShow[];
  isLoading: boolean;
  selectedId: string | null;
  onSelectShow: (show: PcShow) => void;
  onSelectEpisode: (episode: PcEpisodeWithShow) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onDeleteShow: (id: string) => void;
  onDeleteEpisode: (id: string) => void;
}

function CopyLinkButton({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/podcast/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
      title={copied ? "Copied!" : "Copy share link"}
    >
      <Link className="h-3.5 w-3.5" />
    </button>
  );
}

export function PodcastsTable({
  activeTab,
  shows,
  episodes,
  isLoading,
  selectedId,
  onSelectShow,
  onSelectEpisode,
  onCreate,
  onRefresh,
  onDeleteShow,
  onDeleteEpisode,
}: PodcastsTableProps) {
  const [search, setSearch] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const filteredShows = useMemo(
    () =>
      shows.filter(
        (s) =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.slug.toLowerCase().includes(search.toLowerCase()) ||
          idMatchesQuery(s, search),
      ),
    [shows, search],
  );

  const filteredEpisodes = useMemo(
    () =>
      episodes.filter(
        (e) =>
          e.title.toLowerCase().includes(search.toLowerCase()) ||
          e.slug.toLowerCase().includes(search.toLowerCase()) ||
          (e.show?.title ?? "").toLowerCase().includes(search.toLowerCase()) ||
          idMatchesQuery(e, search),
      ),
    [episodes, search],
  );

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      if (activeTab === "shows") {
        await podcastService.removeShow(pendingDeleteId);
        onDeleteShow(pendingDeleteId);
      } else {
        await podcastService.removeEpisode(pendingDeleteId);
        onDeleteEpisode(pendingDeleteId);
      }
    } catch (err) {
      console.error("Delete failed", err);
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  };

  const showColumns = useMemo<MatrxColumnDef<PcShow>[]>(
    () => [
      {
        id: "title",
        header: "Title",
        accessorFn: (show) => show.title,
        cell: (show) => (
          <div className="flex items-center gap-2">
            <InlineMediaRef
              ref={show.image_url ?? null}
              size={{ width: 28, height: 28 }}
              fit="cover"
              rounded="md"
              fallbackIcon={
                <Mic className="h-3.5 w-3.5 text-muted-foreground" />
              }
              className="shrink-0"
              alt=""
            />
            <span className="max-w-[180px] truncate font-medium">
              {show.title}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "slug",
        header: "Slug",
        cell: (show) => (
          <span className="block max-w-[120px] truncate font-mono text-xs text-muted-foreground">
            {show.slug}
          </span>
        ),
      },
      {
        id: "author",
        header: "Author",
        accessorFn: (show) => show.author ?? "",
        cell: (show) => (
          <span className="block max-w-[120px] truncate text-muted-foreground">
            {show.author ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "is_published",
        header: "Published",
        cell: (show) =>
          show.is_published ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" />
          ),
      },
    ],
    [],
  );

  const episodeColumns = useMemo<MatrxColumnDef<PcEpisodeWithShow>[]>(
    () => [
      {
        id: "title",
        header: "Title",
        accessorFn: (episode) => episode.title,
        cell: (episode) => (
          <div className="flex items-center gap-2">
            <InlineMediaRef
              ref={episode.image_url ?? null}
              size={{ width: 28, height: 28 }}
              fit="cover"
              rounded="md"
              fallbackIcon={
                <Music className="h-3.5 w-3.5 text-muted-foreground" />
              }
              className="shrink-0"
              alt=""
            />
            <div className="min-w-0">
              <p className="max-w-[180px] truncate font-medium">
                {episode.title}
              </p>
              <p className="max-w-[180px] truncate font-mono text-xs text-muted-foreground">
                {episode.slug}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "show",
        header: "Show",
        accessorFn: (episode) => episode.show?.title ?? "",
        cell: (episode) => (
          <span className="block max-w-[120px] truncate text-xs text-muted-foreground">
            {episode.show?.title ?? "—"}
          </span>
        ),
      },
      {
        accessorKey: "display_mode",
        header: "Mode",
        cell: (episode) => (
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
            {episode.display_mode}
          </span>
        ),
      },
      {
        accessorKey: "is_published",
        header: "Published",
        cell: (episode) =>
          episode.is_published ? (
            <CheckCircle2 className="h-4 w-4 text-success" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground" />
          ),
      },
    ],
    [],
  );

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b bg-background shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab}…`}
            className="pl-8 h-8 text-sm"
          />
        </div>
        {activeTab === "shows"
          ? filteredShows.length > 0 && (
              <>
                <CopyButtons
                  size="icon"
                  label="Podcast shows (this view)"
                  human={() => showsHumanSummary(filteredShows)}
                  json={() => filteredShows.map(showProjection)}
                  agent={() => ({
                    kind: "podcast-shows",
                    location: "AI Matrx Admin — Knowledge — Podcasts — Shows",
                    description:
                      "The podcast shows currently listed, after the active search filter.",
                    data: {
                      query: { search, total: shows.length },
                      shows: filteredShows.map(showProjection),
                    },
                    summary: showsHumanSummary(filteredShows),
                    attributes: {
                      rows: filteredShows.length,
                      total: shows.length,
                      published: filteredShows.filter((s) => s.is_published)
                        .length,
                    },
                  })}
                  aiVariants={[
                    keyFieldsAiVariant({
                      kind: "podcast-shows",
                      location: "AI Matrx Admin — Knowledge — Podcasts — Shows",
                      description:
                        "Listed shows projected to their core fields.",
                      visible: filteredShows,
                      project: showProjection,
                      query: { search, total: shows.length },
                      attributes: { rows: filteredShows.length },
                    }),
                  ]}
                  export={{
                    items: [
                      jsonExportItem(() => filteredShows.map(showProjection)),
                      csvExportItem(() => showsExportRows(filteredShows)),
                    ],
                  }}
                />
              </>
            )
          : filteredEpisodes.length > 0 && (
              <>
                <CopyButtons
                  size="icon"
                  label="Podcast episodes (this view)"
                  human={() => episodesHumanSummary(filteredEpisodes)}
                  json={() => filteredEpisodes.map(episodeProjection)}
                  agent={() => ({
                    kind: "podcast-episodes",
                    location:
                      "AI Matrx Admin — Knowledge — Podcasts — Episodes",
                    description:
                      "The episodes currently listed, after the active search filter. Dialogue scripts are omitted per row — copy a single episode to get one.",
                    data: {
                      query: { search, total: episodes.length },
                      episodes: filteredEpisodes.map(episodeProjection),
                    },
                    summary: episodesHumanSummary(filteredEpisodes),
                    attributes: {
                      rows: filteredEpisodes.length,
                      total: episodes.length,
                      published: filteredEpisodes.filter((e) => e.is_published)
                        .length,
                    },
                  })}
                  aiVariants={[
                    keyFieldsAiVariant({
                      kind: "podcast-episodes",
                      location:
                        "AI Matrx Admin — Knowledge — Podcasts — Episodes",
                      description:
                        "Listed episodes projected to their core fields.",
                      visible: filteredEpisodes,
                      project: episodeProjection,
                      query: { search, total: episodes.length },
                      attributes: { rows: filteredEpisodes.length },
                    }),
                  ]}
                  export={{
                    items: [
                      jsonExportItem(() =>
                        filteredEpisodes.map(episodeProjection),
                      ),
                      csvExportItem(() => episodesExportRows(filteredEpisodes)),
                    ],
                  }}
                />
              </>
            )}
        <Button
          variant="outline"
          size="sm"
          onClick={onRefresh}
          className="h-8 px-2"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" onClick={onCreate} className="h-8 gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          New {activeTab === "shows" ? "Show" : "Episode"}
        </Button>
      </div>

      {/* The podcast editor owns copy/export and selection; the shared table owns its grid controls. Generic inspector/window/copy are intentionally disabled to avoid duplicate row surfaces. */}
      {activeTab === "shows" ? (
        <MatrxDataTable<PcShow>
          tableId="admin/podcasts/editor-shows"
          data={filteredShows}
          columns={showColumns}
          getRowId={(show) => show.id}
          isLoading={isLoading}
          density="condensed"
          copy={false}
          detail={{ enabled: false }}
          window={{ enabled: false }}
          selectedId={selectedId}
          onRowOpen={onSelectShow}
          hidePagination
          pageSize={0}
          coverage={{ noun: "show", answeredBy: "client" }}
          emptyState={{
            title: search
              ? "No shows match your search."
              : "No shows yet. Create one to get started.",
          }}
          rowActions={(show) => (
            <div className="flex items-center gap-0.5">
              <CopyButtons
                size="xs"
                label={show.title}
                human={() => showRowSummary(show)}
                json={() => showProjection(show)}
                agent={() => ({
                  kind: "podcast-show",
                  location: "AI Matrx Admin — Knowledge — Podcasts — Shows",
                  description: "A single podcast show row.",
                  data: showAgentData(show),
                  summary: showRowSummary(show),
                  attributes: {
                    id: show.id,
                    slug: show.slug,
                    published: show.is_published,
                  },
                })}
              />
              <CopyLinkButton slug={show.slug} />
              <button
                type="button"
                onClick={() => onSelectShow(show)}
                className="p-1.5 text-muted-foreground hover:text-foreground"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPendingDeleteId(show.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        />
      ) : (
        <MatrxDataTable<PcEpisodeWithShow>
          tableId="admin/podcasts/editor-episodes"
          data={filteredEpisodes}
          columns={episodeColumns}
          getRowId={(episode) => episode.id}
          isLoading={isLoading}
          density="condensed"
          copy={false}
          detail={{ enabled: false }}
          window={{ enabled: false }}
          selectedId={selectedId}
          onRowOpen={onSelectEpisode}
          hidePagination
          pageSize={0}
          coverage={{ noun: "episode", answeredBy: "client" }}
          emptyState={{
            title: search
              ? "No episodes match your search."
              : "No episodes yet. Create one to get started.",
          }}
          rowActions={(episode) => (
            <div className="flex items-center gap-0.5">
              <CopyButtons
                size="xs"
                label={episode.title}
                human={() => episodeRowSummary(episode)}
                json={() => episodeProjection(episode)}
                agent={() => ({
                  kind: "podcast-episode",
                  location: "AI Matrx Admin — Knowledge — Podcasts — Episodes",
                  description:
                    "A single podcast episode, including its full dialogue script when one exists.",
                  data: episodeAgentData(episode),
                  summary: episodeRowSummary(episode),
                  attributes: {
                    id: episode.id,
                    slug: episode.slug,
                    show: episode.show?.title ?? "",
                    published: episode.is_published,
                    "script-chars": episode.script?.length ?? 0,
                  },
                })}
              />
              <CopyLinkButton slug={episode.slug} />
              <button
                type="button"
                onClick={() => onSelectEpisode(episode)}
                className="p-1.5 text-muted-foreground hover:text-foreground"
                title="Edit"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setPendingDeleteId(episode.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        />
      )}

      {/* Delete confirmation */}
      <AlertDialog
        open={!!pendingDeleteId}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {activeTab === "shows" ? "show" : "episode"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone.
              {activeTab === "shows" &&
                " Episodes linked to this show will have their show reference removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
