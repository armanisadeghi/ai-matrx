"use client";

/**
 * Collections tab (W2-C) — a site's data collections: list with policy badges
 * and live counts, the collection editor dialog, and the Site Data Key block
 * (masked display, copy, rotate-with-confirm).
 */

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CmsCollectionService } from "@/features/cms/services/cmsService";
import type {
  SiteCollection,
  SiteCollectionSummary,
} from "@/features/cms/types";
import { useSiteContext } from "../SiteLayoutClient";
import { CollectionEditorDialog } from "@/features/cms/components/collections/CollectionEditorDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  Copy,
  Database,
  Eye,
  EyeOff,
  Inbox,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return `${key.slice(0, 5)}${"•".repeat(12)}${key.slice(-4)}`;
}

function SiteDataKeyCard() {
  const { site, refreshSite } = useSiteContext();
  const [revealed, setRevealed] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [isRotating, setIsRotating] = useState(false);

  const key = site.data_api_key;

  const handleCopy = async () => {
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      toast.success("Site data key copied");
    } catch {
      toast.error("Could not copy — reveal the key and copy it manually");
    }
  };

  const handleRotate = async () => {
    setIsRotating(true);
    try {
      await CmsCollectionService.rotateDataKey(site.id);
      await refreshSite();
      toast.success("Site data key rotated — published pages pick it up on next render");
      setRotateOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rotate key");
    } finally {
      setIsRotating(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-8 h-8 rounded-md bg-muted/50 flex items-center justify-center shrink-0">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Site Data Key</p>
          <p className="text-xs text-muted-foreground">
            Required on public collection submissions (X-Matrx-Site-Key). It
            ships inside published page HTML — not a secret; rotating it is the
            kill-switch for abusive traffic.
          </p>
        </div>
        {key ? (
          <div className="flex items-center gap-1.5">
            <code className="text-xs font-mono bg-muted/50 rounded px-2 py-1">
              {revealed ? key : maskKey(key)}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setRevealed((r) => !r)}
              aria-label={revealed ? "Hide key" : "Reveal key"}
            >
              {revealed ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={handleCopy}
              aria-label="Copy key"
            >
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={() => setRotateOpen(true)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Rotate
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Generated when you create the first collection.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={rotateOpen}
        onOpenChange={(open) => !isRotating && setRotateOpen(open)}
        title="Rotate the site data key?"
        description="The old key stops working immediately. Published pages pick up the new key automatically on their next render; anything with the old key cached (open tabs, scrapers, bots) will be rejected until it reloads."
        confirmLabel="Rotate key"
        variant="destructive"
        busy={isRotating}
        onConfirm={handleRotate}
      />
    </div>
  );
}

function PolicyBadges({ collection }: { collection: SiteCollection }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {collection.public_write && (
        <Badge variant="secondary" className="text-[10px]">
          Public write
        </Badge>
      )}
      {collection.public_read && (
        <Badge variant="secondary" className="text-[10px]">
          Public read
        </Badge>
      )}
      {collection.validation_mode === "strict" && (
        <Badge variant="secondary" className="text-[10px]">
          Strict
        </Badge>
      )}
      {collection.allow_upsert && (
        <Badge variant="secondary" className="text-[10px]">
          Upsert
        </Badge>
      )}
      {collection.searchable && (
        <Badge variant="secondary" className="text-[10px]">
          Searchable
        </Badge>
      )}
      {collection.status === "archived" && (
        <Badge variant="outline" className="text-[10px]">
          Archived
        </Badge>
      )}
    </div>
  );
}

export default function CollectionsPage() {
  const { siteId } = useParams() as { siteId: string };
  const { refreshSite } = useSiteContext();

  const [collections, setCollections] = useState<SiteCollectionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<SiteCollection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SiteCollection | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await CmsCollectionService.listCollections(siteId);
      setCollections(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load collections",
      );
    } finally {
      setIsLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleSaved = async (_saved: SiteCollection, mintedKey: boolean) => {
    await refresh();
    if (mintedKey) await refreshSite();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await CmsCollectionService.deleteCollection(deleteTarget.id);
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete collection",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleArchive = async (collection: SiteCollection) => {
    setArchivingId(collection.id);
    try {
      if (collection.status === "archived") {
        await CmsCollectionService.updateCollection(collection.id, {
          status: "active",
        });
        toast.success(`Restored "${collection.name}"`);
      } else {
        await CmsCollectionService.archiveCollection(collection.id);
        toast.success(`Archived "${collection.name}"`);
      }
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setArchivingId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading collections…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="px-4 sm:px-6 py-6 space-y-4">
        <div className="flex items-center justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => {
              setEditing(null);
              setEditorOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            New Collection
          </Button>
        </div>

        <SiteDataKeyCard />

        {error && (
          <div className="text-sm text-destructive flex items-center gap-2 p-3 rounded-md bg-destructive/10">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {collections.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground py-16">
            <Database className="h-10 w-10 opacity-30" />
            <p className="text-sm">No collections yet</p>
            <p className="text-xs max-w-md text-center">
              Collections hold structured site data — contact form submissions,
              event listings, testimonials — defined by a field schema, gated by
              per-collection read/write policies.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {collections.map((collection) => (
              <div
                key={collection.id}
                className="rounded-lg border border-border bg-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <Link
                    href={`/cms/${siteId}/collections/${collection.id}`}
                    className="flex items-center gap-3 min-w-0 flex-1 group"
                  >
                    <div className="w-8 h-8 rounded-md bg-muted/50 flex items-center justify-center shrink-0">
                      <Database className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium group-hover:underline truncate">
                        {collection.name}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {collection.slug} · {collection.field_schema.length}{" "}
                        field{collection.field_schema.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </Link>
                  <PolicyBadges collection={collection} />
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/cms/${siteId}/collections/${collection.id}`}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Inbox className="h-3.5 w-3.5" />
                      {collection.item_count} item
                      {collection.item_count === 1 ? "" : "s"}
                      {collection.unread_count > 0 && (
                        <Badge className="text-[10px] px-1.5">
                          {collection.unread_count} new
                        </Badge>
                      )}
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-xs"
                      onClick={() => {
                        setEditing(collection);
                        setEditorOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      disabled={archivingId === collection.id}
                      onClick={() => handleToggleArchive(collection)}
                      aria-label={
                        collection.status === "archived" ? "Restore" : "Archive"
                      }
                    >
                      {archivingId === collection.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : collection.status === "archived" ? (
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      ) : (
                        <Archive className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(collection)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <CollectionEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        siteId={siteId}
        collection={editing}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !isDeleting && !open && setDeleteTarget(null)}
        title={`Delete "${deleteTarget?.name}"?`}
        description="The collection and its items disappear from every surface (soft delete). Public reads and writes stop immediately."
        confirmLabel="Delete"
        variant="destructive"
        busy={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
