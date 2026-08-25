"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Plus,
  RefreshCw,
  Save,
  Search,
  Lightbulb,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import MatrxMiniLoader from "@/components/loaders/MatrxMiniLoader";
import { renderIcon } from "@/components/official/icons/IconResolver";
import { matchesSearch } from "@/utils/search-scoring";
import {
  createAgentAppCategory,
  deleteAgentAppCategory,
  fetchAgentAppCategories,
  updateAgentAppCategory,
  type AgentAppCategoryRow,
  type CreateAgentAppCategoryInput,
} from "@/lib/services/agent-apps-admin-service";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceWriteHandlers } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import {
  ADMIN_AGENT_APPS_SURFACE_NAME,
  createAdminAgentAppsScope,
} from "@/features/surfaces/manifests/admin-agent-apps.manifest";
import { isRegisteredOrLucideIconName } from "@/components/official/icons/IconResolver";

/**
 * Surface-write input guards. These THROW rather than coercing — the writeback
 * seam turns a throw into the error envelope the agent reads back, and a wrong
 * value is the agent's mistake to hear about, not ours to paper over.
 */
function requireString(value: unknown, target: string): string {
  if (typeof value !== "string") {
    throw new Error(
      `${target} must be a string; got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}.`,
    );
  }
  return value;
}

/**
 * Every write target on this surface edits the category open in the right-hand
 * pane. With nothing selected there is no edit buffer to write into — refuse
 * loudly rather than staging text into a form that is not on screen.
 */
function requireSelectedCategory(
  selectedId: string | null,
  target: string,
): void {
  if (!selectedId) {
    throw new Error(
      `Cannot apply ${target}: no category is selected. Ask the admin to pick a category from the sidebar list first — the edit pane is empty, so there is nothing to write into.`,
    );
  }
}

function humanCategory(c: AgentAppCategoryRow): string {
  return [
    `${c.name} (${c.id})`,
    c.description ?? null,
    c.icon ? `Icon: ${c.icon}` : null,
    `Sort order: ${c.sort_order}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export default function AgentAppsCategoriesAdminPage() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<AgentAppCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editData, setEditData] = useState<Partial<AgentAppCategoryRow>>({});
  const [hasUnsaved, setHasUnsaved] = useState(false);
  const [createData, setCreateData] = useState<
    Partial<CreateAgentAppCategoryInput>
  >({});
  const [deleteTarget, setDeleteTarget] = useState<AgentAppCategoryRow | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAgentAppCategories();
      setCategories(data);
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to load categories",
        variant: "destructive",
      });
      setCategories([]);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = categories.filter(
    (c) =>
      searchTerm === "" ||
      matchesSearch(c, searchTerm, [
        { get: (x) => x.name, weight: "title" },
        { get: (x) => x.description, weight: "body" },
        { get: (x) => x.id, weight: "id" },
      ]),
  );

  useEffect(() => {
    if (!selectedId) return;
    const sel = categories.find((c) => c.id === selectedId);
    if (sel) {
      setEditData({
        id: sel.id,
        name: sel.name,
        description: sel.description,
        icon: sel.icon,
        sort_order: sel.sort_order,
      });
      setHasUnsaved(false);
    }
  }, [selectedId, categories]);

  const handleEditChange = <K extends keyof AgentAppCategoryRow>(
    field: K,
    value: AgentAppCategoryRow[K],
  ) => {
    setEditData((p) => ({ ...p, [field]: value }));
    setHasUnsaved(true);
  };

  const handleSave = async () => {
    if (!selectedId || !editData.id) return;
    try {
      await updateAgentAppCategory({
        id: editData.id,
        name: editData.name,
        description: editData.description ?? undefined,
        icon: editData.icon ?? undefined,
        sort_order: editData.sort_order,
      });
      setHasUnsaved(false);
      await load();
      toast({ title: "Saved", description: "Category updated" });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to save category",
        variant: "destructive",
      });
    }
  };

  const handleCreate = async () => {
    if (!createData.id || !createData.name) {
      toast({
        title: "Validation",
        description: "ID and name are required",
        variant: "destructive",
      });
      return;
    }
    try {
      await createAgentAppCategory(createData as CreateAgentAppCategoryInput);
      setIsCreateOpen(false);
      setCreateData({});
      await load();
      toast({ title: "Created", description: "Category created" });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to create category",
        variant: "destructive",
      });
    }
  };

  const handleDiscard = () => {
    if (!selectedId) return;
    const sel = categories.find((c) => c.id === selectedId);
    if (sel) {
      setEditData({
        id: sel.id,
        name: sel.name,
        description: sel.description,
        icon: sel.icon,
        sort_order: sel.sort_order,
      });
      setHasUnsaved(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAgentAppCategory(deleteTarget.id);
      if (selectedId === deleteTarget.id) setSelectedId(null);
      setDeleteTarget(null);
      await load();
      toast({
        title: "Deleted",
        description: `Category ${deleteTarget.name} removed`,
      });
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to delete category",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  const moveUp = async (c: AgentAppCategoryRow) => {
    if (c.sort_order <= 0) return;
    try {
      await updateAgentAppCategory({
        id: c.id,
        sort_order: c.sort_order - 1,
      });
      await load();
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to reorder",
        variant: "destructive",
      });
    }
  };

  const moveDown = async (c: AgentAppCategoryRow) => {
    try {
      await updateAgentAppCategory({
        id: c.id,
        sort_order: c.sort_order + 1,
      });
      await load();
    } catch (err) {
      toast({
        title: "Error",
        description:
          err instanceof Error ? err.message : "Failed to reorder",
        variant: "destructive",
      });
    }
  };

  const selected = selectedId
    ? categories.find((c) => c.id === selectedId)
    : null;

  /**
   * What the edit pane is actually SHOWING for the selected category — the
   * live `editData` buffer, which diverges from the saved row as soon as
   * anything is typed. `editData` trails `selectedId` by one effect, so fall
   * back to the saved row until the two agree.
   */
  const selectedCategoryView = selected
    ? editData.id === selected.id
      ? {
          id: selected.id,
          name: editData.name ?? "",
          description: editData.description ?? null,
          icon: editData.icon ?? null,
          sort_order: editData.sort_order ?? selected.sort_order,
        }
      : {
          id: selected.id,
          name: selected.name,
          description: selected.description ?? null,
          icon: selected.icon ?? null,
          sort_order: selected.sort_order,
        }
    : undefined;

  /**
   * Agent write targets (manifest `writeTargets`). Each one stages into the
   * SAME `editData` buffer the admin's own typing writes, through the same
   * `handleEditChange` setter — so the "Unsaved Changes" badge and the Save
   * button behave identically whether a human or an agent produced the value,
   * and `handleSave` (the admin's Save press → `updateAgentAppCategory`)
   * stays the only path to the database. Nothing here writes supabase.
   */
  const buildWriteHandlers = (): SurfaceWriteHandlers => ({
    category_name: (value) => {
      requireSelectedCategory(selectedId, "category_name");
      const next = requireString(value, "category_name");
      if (!next.trim()) {
        throw new Error(
          "category_name must be a non-empty string — a category cannot be left unnamed.",
        );
      }
      handleEditChange("name", next);
    },
    category_description: (value) => {
      requireSelectedCategory(selectedId, "category_description");
      handleEditChange(
        "description",
        requireString(value, "category_description"),
      );
    },
    category_icon: async (value) => {
      requireSelectedCategory(selectedId, "category_icon");
      const next = requireString(value, "category_icon").trim();
      if (next && !(await isRegisteredOrLucideIconName(next))) {
        throw new Error(
          `category_icon "${next}" is not a known icon. Use the exact PascalCase name of a lucide-react icon (e.g. "PenTool", "Lightbulb", "Zap"), or an empty string to clear it.`,
        );
      }
      handleEditChange("icon", next);
    },
  });

  if (loading && categories.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <MatrxMiniLoader />
      </div>
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={ADMIN_AGENT_APPS_SURFACE_NAME}
      getScope={() =>
        createAdminAgentAppsScope({
          admin_section: "categories",
          categories_list: categories.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description ?? null,
            icon: c.icon ?? null,
            sort_order: c.sort_order,
          })),
          categories_count: categories.length,
          categories_search: searchTerm,
          selected_category: selectedCategoryView,
          category_has_unsaved_changes: selected ? hasUnsaved : undefined,
        })
      }
      getWriteHandlers={buildWriteHandlers}
    >
    <div className="flex h-full w-full bg-textured overflow-hidden">
      <div className="w-80 border-r border-border flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-1.5">
              <Tag className="h-4 w-4" />
              Categories
            </h2>
            <div className="flex gap-1.5">
              {categories.length > 0 && (
                <CopyButtons
                  size="icon"
                  label={`Categories (${categories.length})`}
                  human={() => categories.map(humanCategory).join("\n\n")}
                  json={() => categories}
                  agent={() => ({
                    kind: "agent-app-categories",
                    location: "AI Matrx Admin — Agent Apps — Categories",
                    description: "Every agent-app category.",
                    data: categories,
                    attributes: { count: categories.length },
                  })}
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void load()}
                disabled={loading}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                onClick={() => {
                  setCreateData({
                    id: "",
                    name: "",
                    description: "",
                    icon: "",
                    sort_order: categories.length * 10,
                  });
                  setIsCreateOpen(true);
                }}
                size="sm"
              >
                <Plus className="w-4 h-4 mr-1" />
                Add
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 text-[16px]"
            />
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {filtered.map((c) => (
              <div
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`group/x flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors mb-1 ${
                  selectedId === c.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {renderIcon(c.icon, { className: "w-4 h-4" }, "Tag")}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.id}
                    </div>
                  </div>
                </div>
                <CopyButtons
                  size="xs"
                  label={c.name}
                  className="opacity-0 group-hover/x:opacity-100 focus-within:opacity-100"
                  human={() => humanCategory(c)}
                  json={() => c}
                  agent={() => ({
                    kind: "agent-app-category",
                    location: "AI Matrx Admin — Agent Apps — Categories",
                    description: "A single agent-app category.",
                    data: c,
                    summary: humanCategory(c),
                    attributes: { id: c.id },
                  })}
                />
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      void moveUp(c);
                    }}
                    disabled={c.sort_order === 0}
                  >
                    <ArrowUp className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 w-5 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      void moveDown(c);
                    }}
                  >
                    <ArrowDown className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>

        <div className="p-3 border-t border-border bg-muted/40">
          <div className="text-xs text-muted-foreground">
            {filtered.length} categories
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="p-4 border-b border-border bg-card">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold text-foreground">
                    Edit Category
                  </h1>
                  {hasUnsaved && (
                    <Badge
                      variant="outline"
                      className="text-warning border-warning"
                    >
                      Unsaved Changes
                    </Badge>
                  )}
                  <CopyButtons
                    size="icon"
                    label={selected.name}
                    human={() => humanCategory(selected)}
                    json={() => selected}
                    agent={() => ({
                      kind: "agent-app-category",
                      location: "AI Matrx Admin — Agent Apps — Categories",
                      description: "The category record open in this edit pane.",
                      data: selected,
                      summary: humanCategory(selected),
                      attributes: { id: selected.id },
                    })}
                  />
                </div>
                <div className="flex items-center gap-2">
                  {hasUnsaved && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDiscard}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Discard
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!hasUnsaved}
                  >
                    <Save className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteTarget(selected)}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete
                  </Button>
                </div>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-6 max-w-3xl">
                <Card>
                  <CardHeader>
                    <CardTitle>Category Details</CardTitle>
                    <CardDescription>
                      Configure the category information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="edit-id">ID</Label>
                        <Input
                          id="edit-id"
                          value={editData.id ?? ""}
                          disabled
                          className="bg-muted text-[16px]"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Cannot be changed after creation
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="edit-name">Name</Label>
                        <Input
                          id="edit-name"
                          value={editData.name ?? ""}
                          onChange={(e) =>
                            handleEditChange("name", e.target.value)
                          }
                          placeholder="Category name"
                          className="text-[16px]"
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="edit-description">Description</Label>
                      <Textarea
                        id="edit-description"
                        value={editData.description ?? ""}
                        onChange={(e) =>
                          handleEditChange("description", e.target.value)
                        }
                        rows={3}
                        className="text-[16px]"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="edit-icon">Icon (Lucide React)</Label>
                        <div className="flex gap-2">
                          <div className="flex-shrink-0 w-10 h-10 border border-border rounded-md flex items-center justify-center bg-muted">
                            {renderIcon(
                              editData.icon,
                              { className: "w-5 h-5" },
                              "Tag",
                            )}
                          </div>
                          <Input
                            id="edit-icon"
                            value={editData.icon ?? ""}
                            onChange={(e) =>
                              handleEditChange("icon", e.target.value)
                            }
                            placeholder="e.g., Lightbulb"
                            className="text-[16px]"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          Use names from lucide-react (e.g., Lightbulb, Zap,
                          PenTool)
                        </p>
                      </div>
                      <div>
                        <Label htmlFor="edit-sort">Sort Order</Label>
                        <Input
                          id="edit-sort"
                          type="number"
                          value={editData.sort_order ?? 0}
                          onChange={(e) =>
                            handleEditChange(
                              "sort_order",
                              parseInt(e.target.value) || 0,
                            )
                          }
                          className="text-[16px]"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Lightbulb className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Category Selected</h3>
              <p className="text-sm">
                Select a category from the sidebar to view and edit its
                details.
              </p>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create New Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-id">ID</Label>
                <Input
                  id="create-id"
                  value={createData.id ?? ""}
                  onChange={(e) =>
                    setCreateData({ ...createData, id: e.target.value })
                  }
                  placeholder="e.g., content-writing"
                  className="text-[16px]"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Lowercase, hyphenated (used in URLs)
                </p>
              </div>
              <div>
                <Label htmlFor="create-name">Name</Label>
                <Input
                  id="create-name"
                  value={createData.name ?? ""}
                  onChange={(e) =>
                    setCreateData({ ...createData, name: e.target.value })
                  }
                  placeholder="Category name"
                  className="text-[16px]"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="create-description">Description</Label>
              <Textarea
                id="create-description"
                value={createData.description ?? ""}
                onChange={(e) =>
                  setCreateData({ ...createData, description: e.target.value })
                }
                rows={3}
                className="text-[16px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="create-icon">Icon (Lucide React)</Label>
                <div className="flex gap-2">
                  <div className="flex-shrink-0 w-10 h-10 border border-border rounded-md flex items-center justify-center bg-muted">
                    {renderIcon(
                      createData.icon,
                      { className: "w-5 h-5" },
                      "Tag",
                    )}
                  </div>
                  <Input
                    id="create-icon"
                    value={createData.icon ?? ""}
                    onChange={(e) =>
                      setCreateData({ ...createData, icon: e.target.value })
                    }
                    placeholder="e.g., Lightbulb"
                    className="text-[16px]"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="create-sort">Sort Order</Label>
                <Input
                  id="create-sort"
                  type="number"
                  value={createData.sort_order ?? categories.length * 10}
                  onChange={(e) =>
                    setCreateData({
                      ...createData,
                      sort_order: parseInt(e.target.value) || 0,
                    })
                  }
                  className="text-[16px]"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setIsCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleCreate}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {deleteTarget && (
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Category</AlertDialogTitle>
              <AlertDialogDescription>
                Delete &quot;{deleteTarget.name}&quot;? Agent apps assigned to
                this category will be orphaned (the category column is a loose
                text reference). This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
    </SurfaceRuntimeProvider>
  );
}
