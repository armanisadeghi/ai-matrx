"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { ADMIN_KNOWLEDGE_SURFACE_NAME, createAdminKnowledgeScope } from "@/features/surfaces/manifests/admin-knowledge.manifest";
import { idMatchesQuery } from "@ai-matrx/kit/search-scoring";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Pencil,
  Trash2,
  Link,
  Mic,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { MatrxDataTable, type MatrxColumnDef } from "@ai-matrx/design-system/data-table";
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
import { podcastService } from "../../service";
import type { PcShow } from "../../types";
import { InlineMediaRef } from "@ai-matrx/media/react";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { PublicPageLink } from "./PublicPageLink";
import { podcastShowAdminHref } from "../../utils";
import { pushAppHref, replaceAppHref } from "@/lib/deployment/navigate";

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
      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
      title={copied ? "Copied!" : "Copy public link"}
    >
      <Link className="h-3.5 w-3.5" />
    </button>
  );
}

export function ShowsClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [shows, setShows] = useState<PcShow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // URL-driven search state — survives refresh
  const search = searchParams.get("q") ?? "";

  const setSearch = (value: string) => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set("q", value);
      else params.delete("q");
      // Free-text search — replace so typing does not push per keystroke.
      replaceAppHref(router, `/administration/knowledge/podcasts/shows?${params.toString()}`);
    });
  };

  const load = async () => {
    setIsLoading(true);
    try {
      setShows(await podcastService.fetchAllShows());
    } catch (e) {
      console.error("Failed to load shows", e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () =>
      shows.filter(
        (s) =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.slug.toLowerCase().includes(search.toLowerCase()) ||
          (s.author ?? "").toLowerCase().includes(search.toLowerCase()) ||
          idMatchesQuery(s, search),
      ),
    [shows, search],
  );

  const handleDeleteConfirm = async () => {
    if (!pendingDeleteId) return;
    setIsDeleting(true);
    try {
      await podcastService.removeShow(pendingDeleteId);
      setShows((prev) => prev.filter((s) => s.id !== pendingDeleteId));
    } catch (e) {
      console.error("Delete failed", e);
    } finally {
      setIsDeleting(false);
      setPendingDeleteId(null);
    }
  };

  const columns = useMemo<MatrxColumnDef<PcShow>[]>(() => [
    { id: "show", header: "Show", accessorFn: (show) => show.title, cell: (show) => {
      return <div className="flex items-center gap-2"><InlineMediaRef ref={show.image_url ?? null} size={{ width: 32, height: 32 }} fit="cover" rounded="md" fallbackIcon={<Mic className="h-4 w-4 text-muted-foreground" />} className="shrink-0" alt="" /><div className="min-w-0"><EntityRef token="pc_show" id={show.id} name={show.title} href={podcastShowAdminHref(show.id)} showIcon={false} className="max-w-[200px] font-medium" /><p className="text-xs text-muted-foreground">{show.is_published ? "Published" : "Draft"}</p></div></div>;
    } },
    { accessorKey: "slug", header: "Slug", cell: (show) => <span className="block max-w-[140px] truncate font-mono text-xs text-muted-foreground">{show.slug}</span> },
    { id: "author", header: "Author", accessorFn: (show) => show.author ?? "", cell: (show) => <span className="block max-w-[140px] truncate text-sm text-muted-foreground">{show.author ?? "—"}</span> },
    { accessorKey: "is_published", header: "Published", cell: (show) => show.is_published ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" /> },
  ], []);

  return (
    <SurfaceRuntimeProvider surfaceName={ADMIN_KNOWLEDGE_SURFACE_NAME} getScope={() => createAdminKnowledgeScope({ knowledge_section: "podcasts_shows", podcast_shows: shows, podcast_shows_search: search })}>
    <>
      <MatrxDataTable<PcShow>
        tableId="admin/podcasts/shows"
        data={filtered}
        columns={columns}
        getRowId={(show) => show.id}
        isLoading={isLoading}
        isFetching={isPending}
        density="condensed"
        copy={false}
        detail={{ enabled: false }}
        onRowOpen={(show) => startTransition(() => pushAppHref(router, podcastShowAdminHref(show.id)))}
        rowActions={(show) => <div className="flex items-center gap-0.5"><PublicPageLink slug={show.slug} label={show.title} /><CopyLinkButton slug={show.slug} /><button type="button" onClick={() => startTransition(() => pushAppHref(router, podcastShowAdminHref(show.id)))} className="p-1.5 text-muted-foreground hover:text-foreground" title="Edit show"><Pencil className="h-3.5 w-3.5" /></button><button type="button" onClick={() => setPendingDeleteId(show.id)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button></div>}
        emptyState={{ title: search ? "No shows match your search." : "No shows yet. Create one to get started." }}
        toolbar={{ title: "Shows", search: true, searchValue: search, onSearchChange: setSearch, searchPlaceholder: "Search shows…", refresh: { onRefresh: load, label: "Refresh" }, add: { onAdd: () => startTransition(() => pushAppHref(router, "/administration/knowledge/podcasts/shows/new")) } }}
      />

      <AlertDialog
        open={!!pendingDeleteId}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete show?</AlertDialogTitle>
            <AlertDialogDescription>
              This cannot be undone. Episodes linked to this show will have
              their show reference removed.
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
    </SurfaceRuntimeProvider>
  );
}
