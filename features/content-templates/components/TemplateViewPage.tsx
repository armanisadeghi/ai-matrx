"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ContentTemplateDB,
  MessageRole,
} from "@/features/content-templates/types/content-templates-db";
import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeaderPortal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  ArrowLeft,
  Save,
  Loader2,
  Pencil,
  Eye,
  Copy,
  Trash2,
  Globe,
  Lock,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import {
  updateTemplate,
  deleteTemplate,
  clearTemplateCache,
} from "@/features/content-templates/services/content-templates-service";

const MESSAGE_ROLES: { value: MessageRole; label: string }[] = [
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
  { value: "tool", label: "Tool" },
];

const ROLE_COLORS: Record<string, string> = {
  system:
    "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  user: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  assistant:
    "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  tool: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
};

interface TemplateViewPageProps {
  template: ContentTemplateDB;
  canEdit: boolean;
  defaultMode?: "view" | "edit";
}

function TemplatePageHeader({
  mode,
  canEdit,
  isSaving,
  isDirty,
  canSave,
  onBack,
  onModeChange,
  onSave,
  onCopy,
  onDelete,
}: {
  mode: "view" | "edit";
  canEdit: boolean;
  isSaving: boolean;
  isDirty: boolean;
  canSave: boolean;
  onBack: () => void;
  onModeChange: (m: "view" | "edit") => void;
  onSave: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <PageSpecificHeader>
      <div className="flex items-center gap-1.5 w-full px-1">
        {/* Back */}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>

        {/* View / Edit toggle pill */}
        {canEdit && (
          <div className="flex items-center gap-0.5 rounded-full bg-muted p-0.5 flex-shrink-0">
            <button
              onClick={() => onModeChange("view")}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                mode === "view"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Eye className="h-3 w-3" />
              View
            </button>
            <button
              onClick={() => onModeChange("edit")}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                mode === "edit"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          </div>
        )}

        <div className="flex-1" />

        {/* Right actions */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onCopy}
            title="Copy content"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>

          {canEdit && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={onDelete}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>

              {mode === "edit" && (
                <Button
                  size="icon"
                  onClick={onSave}
                  disabled={isSaving || !isDirty || !canSave}
                  className="h-8 w-8"
                  title="Save"
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </PageSpecificHeader>
  );
}

/** Auto-growing textarea — expands with content, no inner scroll */
function AutoTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.style.height = "auto";
      ref.current.style.height = `${ref.current.scrollHeight}px`;
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={6}
      style={{ fontSize: "16px" }}
      className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none overflow-hidden"
    />
  );
}

export function TemplateViewPage({
  template,
  canEdit,
  defaultMode = "view",
}: TemplateViewPageProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [mode, setMode] = useState<"view" | "edit">(
    canEdit ? defaultMode : "view",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Edit state
  const [label, setLabel] = useState(template.label ?? "");
  const [content, setContent] = useState(template.content ?? "");
  const [role, setRole] = useState<MessageRole>(template.role ?? "user");
  const [isPublic, setIsPublic] = useState(template.is_public);
  const [tagsInput, setTagsInput] = useState((template.tags ?? []).join(", "));

  const isDirty =
    label !== (template.label ?? "") ||
    content !== (template.content ?? "") ||
    role !== (template.role ?? "user") ||
    isPublic !== template.is_public ||
    tagsInput !== (template.tags ?? []).join(", ");

  const canSave = label.trim().length > 0 && content.trim().length > 0;

  const handleBack = useCallback(() => router.back(), [router]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(template.content ?? "").then(() => {
      toast({ title: "Copied to clipboard" });
    });
  }, [template.content, toast]);

  const handleSave = useCallback(async () => {
    if (isSaving || !canSave) return;
    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    setIsSaving(true);
    try {
      await updateTemplate({
        id: template.id,
        label: label.trim(),
        content: content.trim(),
        role,
        is_public: isPublic,
        tags,
      });
      clearTemplateCache();
      toast({ title: "Template saved" });
      setMode("view");
    } catch (err) {
      console.error("Error saving template:", err);
      toast({ title: "Failed to save template", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }, [
    isSaving,
    canSave,
    tagsInput,
    template.id,
    label,
    content,
    role,
    isPublic,
    toast,
  ]);

  const handleDeleteConfirm = useCallback(async () => {
    setIsDeleting(true);
    try {
      await deleteTemplate(template.id);
      clearTemplateCache();
      toast({ title: "Template deleted" });
      router.back();
    } catch (err) {
      console.error("Error deleting template:", err);
      toast({ title: "Failed to delete template", variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  }, [template.id, toast, router]);

  return (
    <>
      <TemplatePageHeader
        mode={mode}
        canEdit={canEdit}
        isSaving={isSaving}
        isDirty={isDirty}
        canSave={canSave}
        onBack={handleBack}
        onModeChange={setMode}
        onSave={handleSave}
        onCopy={handleCopy}
        onDelete={() => setIsDeleteOpen(true)}
      />

      {/* Single scroll area — the page itself scrolls, nothing nested */}
      <div className="min-h-[calc(100dvh-var(--header-height))] bg-textured">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-16">
          {mode === "view" ? (
            /* ── View Mode ── */
            <div className="space-y-3">
              <div>
                <h1 className="text-base font-bold leading-snug">
                  {template.label || "Untitled"}
                </h1>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <span
                    className={`inline-flex items-center px-1.5 py-0 text-[11px] font-medium rounded border ${ROLE_COLORS[template.role ?? "user"] ?? ROLE_COLORS.user}`}
                  >
                    {template.role}
                  </span>
                  {template.is_public ? (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-green-600 dark:text-green-400">
                      <Globe className="w-2.5 h-2.5" />
                      Public
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                      <Lock className="w-2.5 h-2.5" />
                      Private
                    </span>
                  )}
                  {template.tags &&
                    template.tags.length > 0 &&
                    template.tags.map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-[10px] px-1.5 py-0 h-4"
                      >
                        {tag}
                      </Badge>
                    ))}
                </div>
              </div>

              <div className="rounded-lg border border-border bg-card">
                <pre className="p-3 text-sm font-mono leading-relaxed whitespace-pre-wrap break-words text-foreground">
                  {template.content || ""}
                </pre>
              </div>
            </div>
          ) : (
            /* ── Edit Mode ── compact fields, auto-grow textarea */
            <div className="space-y-3">
              {/* Label + Type in one row */}
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Template name"
                  style={{ fontSize: "16px" }}
                  className="w-full rounded-md border border-input bg-background px-3 h-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Select
                  value={role}
                  onValueChange={(v) => setRole(v as MessageRole)}
                >
                  <SelectTrigger
                    className="h-9 w-32 text-sm"
                    style={{ fontSize: "16px" }}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MESSAGE_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tags + Visibility in one row */}
              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <input
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="Tags (comma-separated)"
                  style={{ fontSize: "16px" }}
                  className="w-full rounded-md border border-input bg-background px-3 h-9 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <div className="flex items-center gap-2 h-9 px-2 rounded-md border border-input bg-background flex-shrink-0">
                  <Switch
                    id="visibility"
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                    className="scale-90"
                  />
                  <label
                    htmlFor="visibility"
                    className="text-xs cursor-pointer select-none text-muted-foreground whitespace-nowrap"
                  >
                    {isPublic ? "Public" : "Private"}
                  </label>
                </div>
              </div>

              {/* Content — auto-grow, no height cap */}
              <AutoTextarea
                value={content}
                onChange={setContent}
                placeholder="Write your template content here..."
              />
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &ldquo;{template.label}&rdquo;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
