"use client";

import React, { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  RefreshCw,
  Search,
  Pencil,
  Trash2,
  Link,
  Mic,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { InlineMediaRef } from "@/features/files";

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
      router.replace(`/administration/podcasts/shows?${params.toString()}`);
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
          (s.author ?? "").toLowerCase().includes(search.toLowerCase()),
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

  const SKELETON_WIDTHS = [
    ["w-3/5", "w-2/5", "w-4/5", "w-1/2"],
    ["w-4/5", "w-3/5", "w-2/5", "w-3/4"],
    ["w-1/2", "w-4/5", "w-3/5", "w-2/3"],
    ["w-2/3", "w-1/2", "w-4/5", "w-3/5"],
    ["w-3/4", "w-2/3", "w-1/2", "w-4/5"],
  ] as const;

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-background shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shows…"
            className="pl-8 h-8 text-sm"
          />
          {isPending && (
            <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={load}
          className="h-8 px-2"
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="sm"
          className="h-8 gap-1.5"
          onClick={() =>
            startTransition(() =>
              router.push("/administration/podcasts/shows/new"),
            )
          }
        >
          <Plus className="h-3.5 w-3.5" />
          New Show
        </Button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted/50 border-b z-10">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                Show
              </th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                Slug
              </th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">
                Author
              </th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground w-24">
                Published
              </th>
              <th className="w-28 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              SKELETON_WIDTHS.map((cols, i) => (
                <tr key={i} className="border-b">
                  {cols.map((w, j) => (
                    <td key={j} className="px-4 py-3">
                      <div
                        className={`h-4 bg-muted rounded animate-pulse ${w}`}
                      />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-16 text-center text-muted-foreground text-sm"
                >
                  {search
                    ? "No shows match your search."
                    : "No shows yet. Create one to get started."}
                </td>
              </tr>
            ) : (
              filtered.map((show) => (
                <tr
                  key={show.id}
                  onClick={() =>
                    startTransition(() =>
                      router.push(`/administration/podcasts/shows/${show.id}`),
                    )
                  }
                  className="border-b cursor-pointer group transition-colors hover:bg-muted/40"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <InlineMediaRef
                        ref={show.image_url ?? null}
                        size={{ width: 32, height: 32 }}
                        fit="cover"
                        rounded="md"
                        fallbackIcon={<Mic className="h-4 w-4 text-muted-foreground" />}
                        className="shrink-0"
                        alt=""
                      />
                      <div>
                        <p className="font-medium truncate max-w-[200px]">
                          {show.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {show.is_published ? "Published" : "Draft"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs truncate max-w-[140px]">
                    {show.slug}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-sm truncate max-w-[140px]">
                    {show.author ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    {show.is_published ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Circle className="h-4 w-4 text-muted-foreground" />
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-0.5">
                      <CopyLinkButton slug={show.slug} />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startTransition(() =>
                            router.push(
                              `/administration/podcasts/shows/${show.id}`,
                            ),
                          );
                        }}
                        className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                        title="Edit show"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDeleteId(show.id);
                        }}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
  );
}
