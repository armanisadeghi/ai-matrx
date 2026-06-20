"use client";

import { useState, useCallback, useMemo } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Plus,
  GripVertical,
  Pencil,
  Trash2,
  Loader2,
  Layers,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
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
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { useTopicContext } from "../../context/ResearchContext";
import { useResearchApi } from "../../hooks/useResearchApi";
import { useResearchTags } from "../../hooks/useResearchState";
import {
  createTag,
  updateTag,
  deleteTag as deleteTagService,
} from "../../service";
import type { ResearchTag } from "../../types";
import { filterAndSortBySearch } from "@/utils/search-scoring";

export default function TagManager() {
  const { topicId } = useTopicContext();
  const api = useResearchApi();
  const isMobile = useIsMobile();
  const routerForSearch = useRouter();
  const pathnameForSearch = usePathname();
  const searchParamsForSearch = useSearchParams();
  const { data: tags, refresh } = useResearchTags(topicId);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTag, setEditTag] = useState<ResearchTag | null>(null);
  const [tagToDelete, setTagToDelete] = useState<ResearchTag | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const search = searchParamsForSearch.get("q") ?? "";
  const setSearch = (value: string) => {
    const params = new URLSearchParams(searchParamsForSearch.toString());
    if (value) {
      params.set("q", value);
    } else {
      params.delete("q");
    }
    routerForSearch.replace(`${pathnameForSearch}?${params.toString()}`, {
      scroll: false,
    });
  };

  const tagList = (tags as ResearchTag[]) ?? [];

  const filtered = useMemo(() => {
    if (!search) return tagList;
    return filterAndSortBySearch(tagList, search, [
      { get: (t) => t.name, weight: "title" },
      { get: (t) => t.description, weight: "body" },
    ]);
  }, [tagList, search]);

  const openCreate = () => {
    setName("");
    setDescription("");
    setEditTag(null);
    setCreateOpen(true);
  };
  const openEdit = (tag: ResearchTag) => {
    setName(tag.name);
    setDescription(tag.description || "");
    setEditTag(tag);
    setCreateOpen(true);
  };

  const handleSave = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editTag) {
        await updateTag(editTag.id, { name, description: description || null });
      } else {
        await createTag(topicId, { name, description: description || null });
      }
      setCreateOpen(false);
      refresh();
    } finally {
      setSaving(false);
    }
  }, [topicId, editTag, name, description, refresh]);

  const handleDelete = useCallback(async () => {
    if (!tagToDelete) return;
    await deleteTagService(tagToDelete.id);
    setTagToDelete(null);
    refresh();
  }, [tagToDelete, refresh]);

  const handleConsolidate = useCallback(
    async (tagId: string) => {
      await api.consolidateTag(topicId, tagId);
      refresh();
    },
    [api, topicId, refresh],
  );

  const formContent = (
    <div className="space-y-3 p-4">
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          Name
        </label>
        <ProInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Tag name..."
          className="h-9 text-xs rounded-lg"
          wrapperClassName="w-full"
          autoFocus
        />
      </div>
      <div className="space-y-1">
        <label className="text-[11px] font-medium text-muted-foreground">
          Description
        </label>
        <ProTextarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Optional description..."
          autoGrow
          minHeight={50}
          maxHeight={120}
          className="text-xs rounded-lg"
          wrapperClassName="w-full"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={() => setCreateOpen(false)}
          className="inline-flex items-center h-8 px-4 rounded-full matrx-glass-card text-xs font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[44px]"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!name.trim() || saving}
          className={cn(
            "inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium transition-all min-h-[44px]",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-40 disabled:pointer-events-none",
          )}
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin" />}
          {editTag ? "Update" : "Create"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2 rounded-full matrx-glass-thin-border px-3 py-1.5">
        <span className="text-xs font-medium text-foreground/80">Tags</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {filtered.length}/{tagList.length}
        </span>
        <div className="flex-1 relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tags..."
            className="w-full h-6 pl-7 pr-2 text-[11px] rounded-full matrx-glass-card border-0 bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
            style={{ fontSize: "16px" }}
          />
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-1 h-6 px-2.5 rounded-full matrx-glass-card text-[11px] font-medium text-primary hover:text-primary/80 transition-colors min-h-[44px] sm:min-h-0"
        >
          <Plus className="h-3 w-3" />
          <span className="hidden sm:inline">Add Tag</span>
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[280px] gap-3 text-center px-4">
          <div className="h-12 w-12 rounded-2xl bg-primary/8 flex items-center justify-center">
            <Layers className="h-6 w-6 text-primary/40" />
          </div>
          <div>
            <p className="text-xs font-medium text-foreground/70">
              {tagList.length === 0 ? "No tags yet" : "No matches"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1 max-w-[240px]">
              {tagList.length === 0
                ? "Create tags to categorize and organize your research sources into themes."
                : "Try adjusting your search to find what you're looking for."}
            </p>
          </div>
          {tagList.length === 0 && (
            <button
              onClick={() => setCreateOpen(true)}
              className="inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all min-h-[44px]"
            >
              <Plus className="h-3 w-3" />
              Create Tag
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((tag) => (
            <div
              key={tag.id}
              className="flex items-center gap-2.5 rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-2.5 sm:p-3 group"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab hidden sm:block" />
              <div className="flex-1 min-w-0">
                <Link
                  href={`/research/topics/${topicId}/tags/${tag.id}`}
                  className="font-medium text-sm hover:text-primary transition-colors"
                >
                  {tag.name}
                </Link>
                {tag.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                    {tag.description}
                  </p>
                )}
              </div>
              {tag.source_count != null && (
                <span className="text-xs text-muted-foreground shrink-0">
                  {tag.source_count} sources
                </span>
              )}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity sm:opacity-100">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  onClick={() => handleConsolidate(tag.id)}
                >
                  <Layers className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full"
                  onClick={() => openEdit(tag)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-full text-destructive"
                  onClick={() => setTagToDelete(tag)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {isMobile ? (
        <Drawer open={createOpen} onOpenChange={setCreateOpen}>
          <DrawerContent className="max-h-[75dvh]">
            <DrawerTitle className="px-4 pt-3 text-sm font-semibold">
              {editTag ? "Edit Tag" : "Create Tag"}
            </DrawerTitle>
            <div className="pb-safe">{formContent}</div>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-sm">
                {editTag ? "Edit Tag" : "Create Tag"}
              </DialogTitle>
            </DialogHeader>
            {formContent}
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!tagToDelete}
        onOpenChange={(open) => !open && setTagToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tag</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &ldquo;{tagToDelete?.name}&rdquo;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
