"use client";

import React, { useRef, useState } from "react";
import { useParams } from "next/navigation";
import { CmsComponentService } from "@/features/cms/services/cmsService";
import type { ClientComponent } from "@/features/cms/types";
import { useSiteContext } from "../SiteLayoutClient";
import { useCmsComponentSurfaceScope } from "@/features/cms/hooks/useCmsComponentSurfaceScope";
import { CMS_COMPONENT_CONTEXT_MENU_PROPS } from "@/features/cms/agent-context/cmsComponentContextMenuProps";
import { createCmsComponentExtraSections } from "@/features/cms/agent-context/cmsComponentExtraSections";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { SurfaceRoleAgentButton } from "@/features/surfaces/components/chrome/SurfaceRoleAgentButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Plus,
  Loader2,
  AlertCircle,
  Puzzle,
  Pencil,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";

// ── Surface write-target input validation ──────────────────────────────
// The writeback seam (`features/surfaces/runtime/surface-writeback.ts`)
// converts a throw into a safe error envelope the agent reads, so a bad
// shape is REPORTED rather than silently coerced.

/**
 * Both body targets share one shape — `{ [key]: string, mode?: 'replace' |
 * 'append' }` — so they share one reader. Validation happens BEFORE the
 * setState call, never inside the updater, so a contract break throws out of
 * the handler where the seam can catch it.
 */
function readBodyWrite(
  value: unknown,
  key: "html" | "css",
  target: string,
): { body: string; mode: "replace" | "append" } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${target} expects an object value.`);
  }
  const obj = value as Record<string, unknown>;
  const body = obj[key];
  if (typeof body !== "string") {
    throw new Error(`${target}: ${key} must be a string.`);
  }
  const mode = obj.mode ?? "replace";
  if (mode !== "replace" && mode !== "append") {
    throw new Error(`${target}: mode must be 'replace' or 'append'.`);
  }
  return { body, mode };
}

export default function ComponentsPage() {
  const { siteId } = useParams() as { siteId: string };
  const { site, pages, components, componentsLoading, refreshComponents } =
    useSiteContext();
  const [error, setError] = useState<string | null>(null);
  const htmlTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const cssTextareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<ClientComponent | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

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
      await refreshComponents();
      setDialogOpen(false);
      setCreateName("");
      setEditingId(comp.id);
      setEditHtml("");
      setEditCss("");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create component",
      );
    } finally {
      setIsCreating(false);
    }
  };

  const startEditing = (comp: ClientComponent) => {
    setEditingId(comp.id);
    setEditHtml(comp.html_content_draft ?? comp.html_content);
    setEditCss(comp.css_content_draft ?? comp.css_content ?? "");
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await CmsComponentService.deleteComponent(deleteTarget.id);
      await refreshComponents();
      if (editingId === deleteTarget.id) setEditingId(null);
      toast.success(`Deleted "${deleteTarget.name}"`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to delete component",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setIsSavingEdit(true);
    try {
      await CmsComponentService.updateComponent(editingId, {
        htmlContent: editHtml,
        cssContent: editCss || null,
      });
      await refreshComponents();
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save component");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const editingComponent = components.find((c) => c.id === editingId) ?? null;

  // ── Agent-context surface scope (`matrx-user/cms-component`) ─────────
  const buildSurfaceScope = useCmsComponentSurfaceScope({
    site,
    pages,
    components,
    editingComponent,
    htmlContent: editingComponent ? editHtml : undefined,
    cssContent: editingComponent ? editCss : undefined,
    pendingComponent: dialogOpen
      ? { name: createName, componentType: createType }
      : undefined,
  });

  // ── Write half of the surface (manifest `writeTargets`) ──────────────
  // Both targets stage into the SAME `useState` setters the user's own typing
  // drives — never a parallel write path, and never a direct save: the human
  // still clicks Save on the expanded row, and THAT is what reaches the live
  // component every page renders. Handlers validate and THROW on a bad shape;
  // the seam turns that into a safe error envelope the agent reads.
  // Fresh closures per call (the `getWriteHandlers` contract).
  const getSurfaceWriteHandlers = () => {
    // No expanded row = no editor buffer to write into. Refusing loudly beats
    // staging a value into a component the user cannot see.
    const requireOpenEditor = (target: string) => {
      if (!editingComponent) {
        throw new Error(
          `${target} requires a component open in the inline editor — none is expanded right now. Ask the user to click Edit on the component they mean.`,
        );
      }
    };
    return {
      component_html_content: (value: unknown) => {
        requireOpenEditor("component_html_content");
        const { body, mode } = readBodyWrite(
          value,
          "html",
          "component_html_content",
        );
        setEditHtml((prev) => (mode === "append" ? prev + body : body));
      },
      component_css_content: (value: unknown) => {
        requireOpenEditor("component_css_content");
        const { body, mode } = readBodyWrite(
          value,
          "css",
          "component_css_content",
        );
        setEditCss((prev) => (mode === "append" ? prev + body : body));
      },
    };
  };

  const makeApplicationScope =
    (ref: React.RefObject<HTMLTextAreaElement | null>) => () => {
      const el = ref.current;
      const start = el?.selectionStart ?? 0;
      const end = el?.selectionEnd ?? 0;
      const selectedText =
        el && start !== end
          ? el.value.slice(Math.min(start, end), Math.max(start, end))
          : "";
      return buildApplicationScopeFromMenuContext({
        selectedText,
        selectionRange: el
          ? { type: "editable", element: el, start, end }
          : null,
        contextData: buildSurfaceScope() as Record<string, unknown>,
      });
    };
  const getHtmlApplicationScope = makeApplicationScope(htmlTextareaRef);
  const getCssApplicationScope = makeApplicationScope(cssTextareaRef);

  if (componentsLoading) {
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
    // The components route is the live `matrx-user/cms-component` runtime: it
    // publishes this screen's own scope to the header Agents chrome (nested
    // inside — and therefore deeper than — the layout's `matrx-user/cms-site`
    // provider in `app/(core)/cms/[siteId]/SiteLayoutClient.tsx`) and registers
    // the handlers for the surface's declared `writeTargets`. ONE scope
    // builder, shared with the context menus' data path.
    <SurfaceRuntimeProvider
      surfaceName={CMS_COMPONENT_CONTEXT_MENU_PROPS.surfaceName}
      getScope={buildSurfaceScope}
      isEditable
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      <div className="h-full overflow-auto">
        <div className="px-4 sm:px-6 py-6 space-y-4">
          <div className="flex items-center justify-end gap-2">
            <SurfaceRoleAgentButton
              surfaceName={CMS_COMPONENT_CONTEXT_MENU_PROPS.surfaceName}
              roleName="component_editor"
              label="Build with AI"
            />
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
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
              {components.map((comp) => {
                const isEditingThis = editingId === comp.id;
                const rowExtraSections = createCmsComponentExtraSections({
                  isEditing: isEditingThis,
                  onSave: () => void handleSaveEdit(),
                  onEdit: () => startEditing(comp),
                  onDelete: () => setDeleteTarget(comp),
                });
                const rowMenuProps = {
                  ...CMS_COMPONENT_CONTEXT_MENU_PROPS,
                  extraSections: rowExtraSections,
                  contextData: buildSurfaceScope() as Record<string, unknown>,
                };
                return (
                  <div
                    key={comp.id}
                    className="rounded-lg border border-border bg-card overflow-hidden"
                  >
                    <NonEditableContextMenu {...rowMenuProps}>
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(comp)}
                            className="gap-1.5 text-xs text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </NonEditableContextMenu>
                    {editingId === comp.id && (
                      <div className="border-t border-border p-4 space-y-3 bg-muted/10">
                        <div>
                          <label className="text-xs font-medium block mb-1">
                            HTML
                          </label>
                          <EditableContextMenu
                            {...CMS_COMPONENT_CONTEXT_MENU_PROPS}
                            extraSections={rowExtraSections}
                            getTextarea={() => htmlTextareaRef.current}
                            getApplicationScope={getHtmlApplicationScope}
                            contextData={
                              buildSurfaceScope() as Record<string, unknown>
                            }
                            onTextReplace={setEditHtml}
                            onSave={() => void handleSaveEdit()}
                          >
                            <ProTextarea
                              ref={htmlTextareaRef}
                              value={editHtml}
                              onChange={(e) => setEditHtml(e.target.value)}
                              className="font-mono text-xs min-h-[120px]"
                              surfaceName={
                                CMS_COMPONENT_CONTEXT_MENU_PROPS.surfaceName
                              }
                              getApplicationScope={getHtmlApplicationScope}
                            />
                          </EditableContextMenu>
                        </div>
                        <div>
                          <label className="text-xs font-medium block mb-1">
                            CSS
                          </label>
                          <EditableContextMenu
                            {...CMS_COMPONENT_CONTEXT_MENU_PROPS}
                            extraSections={rowExtraSections}
                            getTextarea={() => cssTextareaRef.current}
                            getApplicationScope={getCssApplicationScope}
                            contextData={
                              buildSurfaceScope() as Record<string, unknown>
                            }
                            onTextReplace={setEditCss}
                            onSave={() => void handleSaveEdit()}
                          >
                            <ProTextarea
                              ref={cssTextareaRef}
                              value={editCss}
                              onChange={(e) => setEditCss(e.target.value)}
                              className="font-mono text-xs min-h-[80px]"
                              surfaceName={
                                CMS_COMPONENT_CONTEXT_MENU_PROPS.surfaceName
                              }
                              getApplicationScope={getCssApplicationScope}
                            />
                          </EditableContextMenu>
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
                );
              })}
            </div>
          )}
        </div>

        <ConfirmDialog
          open={!!deleteTarget}
          onOpenChange={(open) => !isDeleting && !open && setDeleteTarget(null)}
          title={`Delete "${deleteTarget?.name}"?`}
          description="This removes the component from the site immediately. Any page still referencing it as a header/footer will render without it."
          confirmLabel="Delete"
          variant="destructive"
          busy={isDeleting}
          onConfirm={handleDelete}
        />
      </div>
    </SurfaceRuntimeProvider>
  );
}
