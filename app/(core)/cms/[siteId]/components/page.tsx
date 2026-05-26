"use client";

import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { CmsComponentService } from "@/features/cms/services/cmsService";
import type { ClientComponent } from "@/features/cms/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2, AlertCircle, Puzzle, Pencil, Save } from "lucide-react";

export default function ComponentsPage() {
  const { siteId } = useParams() as { siteId: string };
  const [components, setComponents] = useState<ClientComponent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState("header");
  const [isCreating, setIsCreating] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editHtml, setEditHtml] = useState("");
  const [editCss, setEditCss] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const fetchComponents = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await CmsComponentService.listComponents(siteId);
      setComponents(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [siteId]);

  useEffect(() => {
    fetchComponents();
  }, [fetchComponents]);

  const handleCreate = async () => {
    if (!createName || !createType) return;
    setIsCreating(true);
    try {
      const comp = await CmsComponentService.createComponent({
        siteId,
        componentType: createType,
        name: createName,
        htmlContent: "",
      });
      setComponents((prev) => [...prev, comp]);
      setDialogOpen(false);
      setCreateName("");
      setEditingId(comp.id);
      setEditHtml("");
      setEditCss("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const startEditing = (comp: ClientComponent) => {
    setEditingId(comp.id);
    setEditHtml(comp.html_content_draft ?? comp.html_content);
    setEditCss(comp.css_content_draft ?? comp.css_content ?? "");
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setIsSavingEdit(true);
    try {
      const updated = await CmsComponentService.updateComponent(editingId, {
        htmlContent: editHtml,
        cssContent: editCss || null,
      });
      setComponents((prev) =>
        prev.map((c) => (c.id === editingId ? updated : c)),
      );
      setEditingId(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSavingEdit(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading components…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground">Components</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                New Component
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>New Component</DialogTitle>
                <DialogDescription>
                  Create a reusable component (header, footer, sidebar, etc.)
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <label className="text-sm font-medium block mb-1.5">
                    Name
                  </label>
                  <Input
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Main Header"
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium block mb-1.5">
                    Type
                  </label>
                  <select
                    value={createType}
                    onChange={(e) => setCreateType(e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="header">Header</option>
                    <option value="footer">Footer</option>
                    <option value="sidebar">Sidebar</option>
                    <option value="cta">Call to Action</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={isCreating || !createName}
                >
                  {isCreating && (
                    <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
                  )}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {error && (
          <div className="text-sm text-destructive flex items-center gap-2 p-3 rounded-md bg-destructive/10">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        {components.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-muted-foreground py-16">
            <Puzzle className="h-10 w-10 opacity-30" />
            <p className="text-sm">No components yet</p>
            <p className="text-xs">
              Components are reusable elements like headers and footers.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {components.map((comp) => (
              <div
                key={comp.id}
                className="rounded-lg border border-border bg-card overflow-hidden"
              >
                <div className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-muted/50 flex items-center justify-center">
                      <Puzzle className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{comp.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {comp.component_type}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={comp.is_active ? "default" : "secondary"}
                      className="text-[10px]"
                    >
                      {comp.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {editingId === comp.id ? (
                      <Button
                        size="sm"
                        onClick={handleSaveEdit}
                        disabled={isSavingEdit}
                        className="gap-1.5 text-xs"
                      >
                        {isSavingEdit ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Save
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => startEditing(comp)}
                        className="gap-1.5 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                    )}
                  </div>
                </div>
                {editingId === comp.id && (
                  <div className="border-t border-border p-4 space-y-3 bg-muted/10">
                    <div>
                      <label className="text-xs font-medium block mb-1">
                        HTML
                      </label>
                      <Textarea
                        value={editHtml}
                        onChange={(e) => setEditHtml(e.target.value)}
                        className="font-mono text-xs min-h-[120px]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium block mb-1">
                        CSS
                      </label>
                      <Textarea
                        value={editCss}
                        onChange={(e) => setEditCss(e.target.value)}
                        className="font-mono text-xs min-h-[80px]"
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditingId(null)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
