"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Save, Loader2, FileText, GitCompareArrows } from "lucide-react";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { useToast } from "@/components/ui/use-toast";
import {
  ContentTemplateDB,
  CreateContentTemplateInput,
  UpdateContentTemplateInput,
  MessageRole,
} from "@/features/content-templates/types/content-templates-db";
import {
  createTemplate,
  updateTemplate,
  clearTemplateCache,
} from "@/features/content-templates/services/content-templates-service";
import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeaderPortal";

const MESSAGE_ROLES: { value: MessageRole; label: string }[] = [
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
  { value: "tool", label: "Tool" },
];

interface TemplateEditorProps {
  template?: ContentTemplateDB | null;
  mode: "create" | "edit";
}

/** Auto-growing textarea — expands with content, page scrolls, no inner scroll */
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

function EditorHeader({
  mode,
  isSaving,
  canSave,
  onBack,
  onSave,
  onCompare,
}: {
  mode: "create" | "edit";
  isSaving: boolean;
  canSave: boolean;
  onBack: () => void;
  onSave: () => void;
  onCompare?: () => void;
}) {
  return (
    <PageSpecificHeader>
      <div className="flex items-center gap-1.5 w-full px-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0"
          onClick={onBack}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <FileText className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-sm font-semibold truncate">
            {mode === "create" ? "New Template" : "Edit Template"}
          </span>
        </div>
        {onCompare && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onCompare}
            className="h-8 w-8 flex-shrink-0"
            title="Compare saved vs draft"
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="icon"
          onClick={onSave}
          disabled={isSaving || !canSave}
          className="h-8 w-8 flex-shrink-0"
          title="Save"
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
        </Button>
      </div>
    </PageSpecificHeader>
  );
}

export function TemplateEditor({ template, mode }: TemplateEditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [label, setLabel] = useState(template?.label ?? "");
  const [content, setContent] = useState(template?.content ?? "");
  const [role, setRole] = useState<MessageRole>(template?.role ?? "user");
  const [isPublic, setIsPublic] = useState(template?.is_public ?? false);
  const [tagsInput, setTagsInput] = useState((template?.tags ?? []).join(", "));

  const canSave = label.trim().length > 0 && content.trim().length > 0;

  const openDiff = useOpenDiffViewerWindow();
  const canCompare =
    mode === "edit" && !!template && template.content !== content;
  const handleCompare = useCallback(() => {
    if (!template) return;
    openDiff({
      original: template.content ?? "",
      modified: content,
      originalLabel: "Saved",
      modifiedLabel: "Draft",
      title: `${template.label ?? "Template"} — compare`,
      engine: "auto",
      language: "markdown",
      defaultView: "split",
    });
  }, [openDiff, template, content]);

  const handleBack = useCallback(() => router.back(), [router]);

  const handleSave = useCallback(async () => {
    if (!canSave || isSaving) return;

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    setIsSaving(true);
    try {
      if (mode === "create") {
        const input: CreateContentTemplateInput = {
          label: label.trim(),
          content: content.trim(),
          role,
          is_public: isPublic,
          tags,
        };
        await createTemplate(input);
        toast({ title: "Template created" });
      } else if (template?.id) {
        const input: UpdateContentTemplateInput = {
          id: template.id,
          label: label.trim(),
          content: content.trim(),
          role,
          is_public: isPublic,
          tags,
        };
        await updateTemplate(input);
        toast({ title: "Template saved" });
      }
      clearTemplateCache();
      router.back();
    } catch (err) {
      console.error("Error saving template:", err);
      toast({
        title: "Error",
        description: "Failed to save template",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    canSave,
    isSaving,
    mode,
    label,
    content,
    role,
    isPublic,
    tagsInput,
    template,
    toast,
    router,
  ]);

  return (
    <>
      <EditorHeader
        mode={mode}
        isSaving={isSaving}
        canSave={canSave}
        onBack={handleBack}
        onSave={handleSave}
        onCompare={canCompare ? handleCompare : undefined}
      />

      {/* Single page scroll — no bounded inner container */}
      <div className="min-h-[calc(100dvh-var(--header-height))] bg-textured">
        <div className="max-w-2xl mx-auto px-4 pt-4 pb-16 space-y-3">
          {/* Label + Type in one compact row */}
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

          {/* Tags + Visibility in one compact row */}
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

          {/* Content — auto-grow textarea, page scrolls */}
          <AutoTextarea
            value={content}
            onChange={setContent}
            placeholder="Write your template content here..."
          />
        </div>
      </div>
    </>
  );
}
