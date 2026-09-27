"use client";

// One saved message template (/chat/message-templates/[id]) — view and edit.
//
// The page is its own agent surface (`matrx-user/message-template`): the
// scope comes from `lib/message-template-scope.ts` over the state rendered
// here, and the ONE write target (`template_draft`) stages into this edit
// form through the same setters the inputs use. The person still saves.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, Pencil, Save, Trash2 } from "lucide-react";
import { isPubliclyVisible } from "@/lib/visibility/labels";
import {
  type MessageRole,
  type MessageTemplateDB,
  readMessageTemplateMetadata,
} from "@/features/message-templates/types/message-templates-db";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { EntityCustomFields } from "@/features/unified-data/components/EntityCustomFields";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import {
  updateTemplate,
  deleteTemplate,
  clearTemplateCache,
} from "@/features/message-templates/services/message-templates-service";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import {
  MESSAGE_TEMPLATE_SURFACE_NAME,
  type MessageTemplateDraftScope,
} from "@/features/surfaces/manifests/message-template.manifest";
import {
  buildMessageTemplateScope,
  parseTemplateDraftValue,
  templateManagedBy,
  templateSubject,
} from "@/features/message-templates/lib/message-template-scope";
import type { JsonObject } from "@/types/json";

const LIST_HREF = "/chat/message-templates";

const MESSAGE_ROLES: { value: MessageRole; label: string }[] = [
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
  { value: "tool", label: "Tool" },
];

interface TemplateViewPageProps {
  template: MessageTemplateDB;
  canEdit: boolean;
}

function draftFrom(template: MessageTemplateDB): MessageTemplateDraftScope {
  return {
    label: template.label ?? "",
    content: template.content ?? "",
    subject_template: templateSubject(template),
    role: template.role ?? null,
    tags: template.tags ?? [],
    visibility: isPubliclyVisible(template.visibility) ? "public" : "private",
  };
}

function parseTags(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(",")) {
    const tag = raw.trim();
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

function sameDraft(a: MessageTemplateDraftScope, b: MessageTemplateDraftScope) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function TemplateViewPage({ template, canEdit }: TemplateViewPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageHref = `${LIST_HREF}/${template.id}`;
  const editHref = `${pageHref}?mode=edit`;
  const mode: "view" | "edit" =
    canEdit && searchParams.get("mode") === "edit" ? "edit" : "view";

  // `saved` is the row as last saved — the server prop until this page saves.
  const [saved, setSaved] = useState<MessageTemplateDB>(template);
  const [label, setLabel] = useState(saved.label ?? "");
  const [content, setContent] = useState(saved.content ?? "");
  const [subject, setSubject] = useState(templateSubject(saved));
  const [role, setRole] = useState<MessageRole | null>(saved.role ?? null);
  const [isPublic, setIsPublic] = useState(isPubliclyVisible(saved.visibility));
  const [tagsInput, setTagsInput] = useState((saved.tags ?? []).join(", "));
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const draft: MessageTemplateDraftScope = {
    label: label.trim(),
    content,
    subject_template: subject.trim(),
    role,
    tags: parseTags(tagsInput),
    visibility: isPublic ? "public" : "private",
  };
  const savedDraft = draftFrom(saved);
  const isDirty = !sameDraft(draft, savedDraft);
  const canSave = draft.label.length > 0 && content.trim().length > 0;
  const managedBy = templateManagedBy(saved);
  const savedSubject = templateSubject(saved);
  const displayLabel = saved.label || "Untitled template";

  // Unsaved edits are never lost to a refresh or a closed tab.
  useEffect(() => {
    if (!isDirty) return undefined;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  const getScope = () =>
    buildMessageTemplateScope({
      template: saved,
      canEdit,
      mode,
      draft,
      isDirty,
      saveError,
    });

  const getWriteHandlers = () => ({
    template_draft: {
      validate: (value: unknown) => {
        parseTemplateDraftValue(value, draft, canEdit);
      },
      apply: (value: unknown) => {
        const next = parseTemplateDraftValue(value, draft, canEdit);
        if (next.label !== undefined) setLabel(next.label);
        if (next.content !== undefined) setContent(next.content);
        if (next.subject_template !== undefined) setSubject(next.subject_template);
        if (next.role !== undefined) setRole(next.role);
        if (next.tags !== undefined) setTagsInput(next.tags.join(", "));
        if (next.visibility !== undefined) setIsPublic(next.visibility === "public");
        if (mode !== "edit") router.replace(editHref, { scroll: false });
        return {
          summary: `Staged ${Object.keys(next).join(", ")} in the edit form; the person presses Save to keep it.`,
          data: { staged: Object.keys(next) },
        };
      },
    },
  });

  const handleSave = async () => {
    if (isSaving || !canSave || !isDirty) return;
    // Only what changed is written — an untouched body keeps its exact bytes
    // and an unset role stays unset.
    const patch: Parameters<typeof updateTemplate>[0] = { id: saved.id };
    if (draft.label !== savedDraft.label) patch.label = draft.label;
    if (content !== savedDraft.content) patch.content = content;
    if (role !== savedDraft.role && role) patch.role = role;
    if (draft.visibility !== savedDraft.visibility)
      patch.visibility = isPublic ? "public" : "internal";
    if (JSON.stringify(draft.tags) !== JSON.stringify(savedDraft.tags))
      patch.tags = draft.tags;
    if (draft.subject_template !== savedDraft.subject_template) {
      const metadata: JsonObject = { ...readMessageTemplateMetadata(saved.metadata) };
      if (draft.subject_template) metadata.subject_template = draft.subject_template;
      else delete metadata.subject_template;
      patch.metadata = metadata;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const row = await updateTemplate(patch);
      clearTemplateCache();
      setSaved(row);
      setLabel(row.label ?? "");
      setContent(row.content ?? "");
      setSubject(templateSubject(row));
      setRole(row.role ?? null);
      setIsPublic(isPubliclyVisible(row.visibility));
      setTagsInput((row.tags ?? []).join(", "));
      toast.success("Template saved");
      router.replace(pageHref, { scroll: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveError(message);
      toast.error(`Could not save the template: ${message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete “${displayLabel}”?`,
      description: managedBy
        ? `This permanently removes the template. The platform job "${managedBy}" uses it, and that job will stop working until a replacement exists. This cannot be undone.`
        : "This permanently removes the template for everyone it was shared with. This cannot be undone.",
      confirmLabel: "Delete template",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteTemplate(saved.id);
      clearTemplateCache();
      toast.success("Template deleted");
      router.push(LIST_HREF);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveError(message);
      toast.error(`Could not delete the template: ${message}`);
    }
  };

  const copyText = () =>
    [savedSubject ? `Subject: ${savedSubject}` : null, saved.content ?? ""]
      .filter((part): part is string => part !== null)
      .join("\n\n");

  return (
    <SurfaceRuntimeProvider
      surfaceName={MESSAGE_TEMPLATE_SURFACE_NAME}
      getScope={getScope}
      getWriteHandlers={getWriteHandlers}
      isEditable={canEdit}
    >
      <EntityModeHeader
        backHref={LIST_HREF}
        entityLabel={displayLabel}
        modes={
          canEdit
            ? [
                { name: "View", href: pageHref, icon: Eye },
                { name: "Edit", href: editHref, icon: Pencil },
              ]
            : undefined
        }
        activeModeHref={mode === "edit" ? editHref : pageHref}
        actions={
          canEdit
            ? [
                ...(mode === "edit"
                  ? [
                      {
                        label: isSaving ? "Saving" : isDirty ? "Save" : "Saved",
                        icon: Save,
                        primary: true,
                        disabled: isSaving || !isDirty || !canSave,
                        onPress: handleSave,
                      },
                    ]
                  : []),
                {
                  label: "Delete",
                  icon: Trash2,
                  onPress: handleDelete,
                },
              ]
            : undefined
        }
      />
      <NonEditableContextMenu
        sourceFeature="chat"
        surfaceName={MESSAGE_TEMPLATE_SURFACE_NAME}
        menuVersion={1}
        getApplicationScope={getScope}
        contentSource={{ type: "raw" }}
        contextData={{ content: saved.content ?? "" }}
        entity={{
          type: "message_template",
          id: saved.id,
          title: displayLabel,
          resourceType: "message_template",
        }}
      >
        <div className="matrx-touch-targets h-full overflow-y-auto bg-textured pt-[var(--shell-header-h)]">
          <div className="mx-auto max-w-4xl px-4 pb-16 pt-3">
            {mode === "view" ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  {saved.role && (
                    <Badge variant="outline" className="text-xs capitalize">
                      {saved.role}
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {isPubliclyVisible(saved.visibility) ? "Public" : "Private"}
                  </Badge>
                  {(saved.tags ?? []).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {managedBy && (
                    <span className="text-xs text-muted-foreground">
                      Used by the {managedBy} job
                    </span>
                  )}
                  <div className="ml-auto">
                    <CopyButtons
                      size="sm"
                      unified
                      label={`Message template ${displayLabel}`}
                      human={copyText}
                      json={() => saved}
                      agent={() => buildMessageTemplateScope({
                        template: saved,
                        canEdit: false,
                        mode: "view",
                        draft: savedDraft,
                        isDirty: false,
                        saveError: null,
                      }).message_template as string}
                    />
                  </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  {savedSubject && (
                    <div className="border-b border-border px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Subject </span>
                      <span className="font-mono">{savedSubject}</span>
                    </div>
                  )}
                  <pre className="whitespace-pre-wrap break-words p-3 font-mono text-sm leading-relaxed text-foreground">
                    {saved.content || ""}
                  </pre>
                </div>

                <EntityCustomFields
                  entityToken="message_template"
                  recordId={saved.id}
                  organizationId={saved.organization_id}
                />
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_10rem]">
                  <ProInput
                    aria-label="Template name"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Template name"
                    className="text-base sm:text-sm"
                  />
                  <Select
                    value={role ?? undefined}
                    onValueChange={(v) => setRole(v as MessageRole)}
                  >
                    <SelectTrigger aria-label="Role" className="text-base sm:text-sm">
                      <SelectValue placeholder="Role" />
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

                <ProInput
                  aria-label="Email subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Email subject (optional) — merge fields work here too"
                  className="text-base sm:text-sm"
                />

                <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_auto]">
                  <ProInput
                    aria-label="Tags"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="Tags, separated by commas"
                    className="text-base sm:text-sm"
                  />
                  <label className="matrx-tap-area flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                    <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                    {isPublic ? "Public" : "Private"}
                  </label>
                </div>

                <ProTextarea
                  aria-label="Template body"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write the message. Use {{name}} for a value filled in when the template is used."
                  autoGrow
                  minHeight={160}
                  surfaceName={MESSAGE_TEMPLATE_SURFACE_NAME}
                  sourceFeature="chat"
                  getApplicationScope={getScope}
                  className="font-mono text-base leading-relaxed sm:text-sm"
                />

                {!canSave && (
                  <p className="text-xs text-destructive">
                    A template needs a name and a body before it can be saved.
                  </p>
                )}
                {saveError && (
                  <p className="text-xs text-destructive">{saveError}</p>
                )}
              </div>
            )}
          </div>
        </div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
