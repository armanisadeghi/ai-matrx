"use client";

import { useState, useCallback } from "react";
import { ProTextarea } from "@/components/official/ProTextarea";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Button as SurfaceButton } from "@ai-matrx/design-system";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Save,
  Loader2,
  FileText,
  GitCompareArrows,
} from "lucide-react";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { useToast } from "@/components/ui/use-toast";
import { describeWriteFailure } from "@/lib/errors/writeFailure";
import {
  MessageTemplateEditorSource,
  CreateMessageTemplateInput,
  UpdateMessageTemplateInput,
  MessageRole,
  readMessageTemplateMetadata,
} from "@/features/message-templates/types/message-templates-db";
import {
  createTemplate,
  updateTemplate,
  clearTemplateCache,
} from "@/features/message-templates/services/message-templates-service";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";

const MESSAGE_ROLES: { value: MessageRole; label: string }[] = [
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
  { value: "tool", label: "Tool" },
];

function isMessageRole(value: string): value is MessageRole {
  return MESSAGE_ROLES.some((role) => role.value === value);
}

function readSubjectTemplate(metadata: unknown): string {
  const value = readMessageTemplateMetadata(metadata).subject_template;
  return typeof value === "string" ? value : "";
}

interface TemplateEditorProps {
  template?: MessageTemplateEditorSource | null;
  mode: "create" | "edit";
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
    <RouteHeader
      left={
        <div className="flex items-center gap-1.5 w-full px-1">
          <SurfaceButton
            variant="ghost"
            size="icon"
            className="h-8 w-8 flex-shrink-0"
            onClick={onBack}
          >
            <ArrowLeft className="h-4 w-4" />
          </SurfaceButton>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <FileText className="h-4 w-4 text-primary flex-shrink-0" />
            <span className="text-sm font-semibold truncate">
              {mode === "create" ? "New Template" : "Edit Template"}
            </span>
          </div>
          {onCompare && (
            <Button
              icon={<GitCompareArrows />} aria-label="Compare saved vs draft"
              variant="quiet"
              onClick={onCompare}
              className="flex-shrink-0"
              title="Compare saved vs draft"
            />
          )}
          <Button
            icon={isSaving ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Save />
            )} aria-label="Save"
            variant="primary"
            onClick={onSave}
            disabled={isSaving || !canSave}
            className="flex-shrink-0"
            title="Save"
          />
        </div>
      }
    />
  );
}

export function TemplateEditor({ template, mode }: TemplateEditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const [label, setLabel] = useState(template?.label ?? "");
  const [content, setContent] = useState(template?.content ?? "");
  const [subjectTemplate, setSubjectTemplate] = useState(() =>
    readSubjectTemplate(template?.metadata),
  );
  const [role, setRole] = useState<MessageRole>(template?.role ?? "user");
  const [isPublic, setIsPublic] = useState(
    template?.published_to_web === true,
  );
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

  const handleBack = useCallback(
    () => router.push("/chat/message-templates"),
    [router],
  );

  const handleSave = useCallback(async () => {
    if (!canSave || isSaving) return;

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    setIsSaving(true);
    try {
      const metadata = {
        ...readMessageTemplateMetadata(template?.metadata),
        ...(subjectTemplate.trim()
          ? { subject_template: subjectTemplate.trim() }
          : {}),
      };
      if (!subjectTemplate.trim()) delete metadata.subject_template;
      if (mode === "create") {
        const input: CreateMessageTemplateInput = {
          organization_id: await ensureOrganizationContext(),
          label: label.trim(),
          content: content.trim(),
          role,
          published_to_web: isPublic,
          tags,
          metadata,
        };
        await createTemplate(input);
        toast({ title: "Template created" });
      } else if (template?.id) {
        const input: UpdateMessageTemplateInput = {
          id: template.id,
          label: label.trim(),
          content: content.trim(),
          role,
          ...(isPublic !== (template.published_to_web === true)
            ? { published_to_web: isPublic }
            : {}),
          tags,
          metadata,
        };
        await updateTemplate(input);
        toast({ title: "Template saved" });
      }
      clearTemplateCache();
      router.push("/chat/message-templates");
    } catch (err) {
      // Declining the organization question is an answer, not a failure:
      // nothing was written and nothing is said.
      if (isOrganizationSelectionCancelled(err)) return;
      console.error("Error saving template:", err);
      // The refusal is already a sentence ("Nothing was saved: … your access
      // does not allow saving it.") — say it, never a bare "Failed".
      const words = describeWriteFailure(err, {
        action: mode === "create" ? "create this template" : "save this template",
      });
      toast({
        title: words.title,
        description: words.description,
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
    subjectTemplate,
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
      <div className="h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
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
              onValueChange={(value) => {
                if (!isMessageRole(value)) {
                  throw new Error(`Unknown message role: ${value}`);
                }
                setRole(value);
              }}
            >
              <SelectTrigger
                className="w-32"
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
                id="template-published-to-web"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
              <label
                htmlFor="template-published-to-web"
                className="text-xs cursor-pointer select-none text-muted-foreground whitespace-nowrap"
              >
                {isPublic ? "Published to the web" : "Not published"}
              </label>
            </div>
          </div>

          {/* Content — auto-grow textarea, page scrolls */}
          <input
            value={subjectTemplate}
            onChange={(event) => setSubjectTemplate(event.target.value)}
            placeholder="Email subject (optional) — variables work here too"
            style={{ fontSize: "16px" }}
            className="h-9 w-full rounded-md border border-input bg-background px-3 font-mono text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          {/* Raw text with {{variables}}: ProTextarea brings the formatting
              layer and the "…" menu (copy); it never rewrites the text. */}
          <ProTextarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Write the message..."
            sourceFeature="messages"
            autoGrow
            rows={6}
            style={{ fontSize: "16px" }}
            className="font-mono leading-relaxed"
          />
          <p className="text-xs text-muted-foreground">
            Merge fields are filled from a real record at preview time. Missing
            or blank fields stop the send; they are never replaced with empty
            text.
          </p>
        </div>
      </div>
    </>
  );
}
