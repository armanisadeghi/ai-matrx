"use client";

// One saved message template (/chat/message-templates/[id]) — view and edit.
//
// The page is its own agent surface (`matrx-user/message-template`): the
// scope comes from `lib/message-template-scope.ts` over the state rendered
// here. Every person action has an agent twin: editing → `template_draft`
// (stages into this form; the person saves), Archive → `archive_template`.
// Custom fields are `@ai-matrx/records-ui`'s section, which owns its writes.
//
// Merge fields (`{{party.first_name}}`) are shown in plain words and with an
// example value (`lib/merge-fields.ts`); the raw syntax appears only in the
// edit form, where "Insert field" writes it for the person.

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, Eye, Info, Pencil, Plus, Save } from "lucide-react";
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
import { SegmentedControl } from "@ai-matrx/design-system";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  updateTemplate,
  archiveTemplate,
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
  humanizeManagedBy,
  parseArchiveTemplateValue,
  parseTemplateDraftValue,
  templateManagedBy,
  templateSubject,
} from "@/features/message-templates/lib/message-template-scope";
import {
  COMMON_MERGE_FIELDS,
  mergeFieldToken,
  mergeFieldsIn,
  previewParts,
} from "@/features/message-templates/lib/merge-fields";
import type { JsonObject } from "@/types/json";

const LIST_HREF = "/chat/message-templates";

const MESSAGE_ROLES: { value: MessageRole; label: string }[] = [
  { value: "system", label: "System" },
  { value: "user", label: "User" },
  { value: "assistant", label: "Assistant" },
  { value: "tool", label: "Tool" },
];

const DATE_FORMAT = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

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

function metadataText(metadata: unknown, key: string): string | null {
  const value = readMessageTemplateMetadata(metadata)[key];
  return typeof value === "string" && value.trim() ? value : null;
}

/** Text with each merge field shown by name (or example) instead of {{…}}. */
function FilledText({ text, show }: { text: string; show: "names" | "example" }) {
  return (
    <>
      {previewParts(text).map((part, i) =>
        part.kind === "text" ? (
          <span key={i}>{part.text}</span>
        ) : (
          <span
            key={i}
            title={`${part.field.label} — filled in when the template is used`}
            className={cn(
              "rounded px-1",
              show === "names"
                ? "bg-primary/10 font-medium text-primary"
                : "bg-muted text-foreground",
            )}
          >
            {show === "names" ? part.field.label : part.field.example}
          </span>
        ),
      )}
    </>
  );
}

/** Subject + body as a person reads them, fields named or filled with examples. */
function MessagePreview({ subject, body }: { subject: string; body: string }) {
  const [show, setShow] = useState<"names" | "example">("names");
  const fields = mergeFieldsIn(subject, body);
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">
          {fields.length === 0
            ? "No fields — every send is the same text"
            : `Filled in when used: ${fields.map((f) => f.label).join(", ")}`}
        </span>
        {fields.length > 0 && (
          <SegmentedControl
            size="sm"
            className="ml-auto"
            value={show}
            onValueChange={(v) => setShow(v === "example" ? "example" : "names")}
            data={[
              { value: "names", label: "Field names" },
              { value: "example", label: "Example" },
            ]}
          />
        )}
      </div>
      {subject && (
        <div className="border-b border-border px-3 py-2 text-sm">
          <span className="text-muted-foreground">Subject: </span>
          <FilledText text={subject} show={show} />
        </div>
      )}
      <div className="whitespace-pre-wrap break-words p-3 text-sm leading-relaxed text-foreground">
        {body.trim() ? (
          <FilledText text={body} show={show} />
        ) : (
          <span className="text-muted-foreground">The message is empty.</span>
        )}
      </div>
    </div>
  );
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
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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
  const managedByKey = templateManagedBy(saved);
  const managedBy = managedByKey ? humanizeManagedBy(managedByKey) : null;
  const note = metadataText(saved.metadata, "note");
  const savedSubject = templateSubject(saved);
  const displayLabel = saved.label || "Untitled template";
  // An email template (it has a subject) has no use for a chat-message role;
  // the role is shown only for a message template that has no subject.
  const isEmail = Boolean(savedSubject || subject.trim());
  const showRole = !isEmail;
  const usedFields = mergeFieldsIn(subject, content);
  const updated = saved.updated_at ? DATE_FORMAT.format(new Date(saved.updated_at)) : null;

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

  const archiveNow = async () => {
    await archiveTemplate(saved.id);
    clearTemplateCache();
    toast.success("Template moved to Trash");
    router.push(LIST_HREF);
  };

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
    archive_template: {
      validate: (value: unknown) => {
        parseArchiveTemplateValue(value, canEdit);
      },
      apply: async (value: unknown) => {
        parseArchiveTemplateValue(value, canEdit);
        await archiveNow();
        return {
          summary: `Moved "${displayLabel}" to Trash; it can be restored there.`,
          data: { archived: saved.id },
        };
      },
    },
  });

  const insertField = (path: string) => {
    const token = mergeFieldToken(path);
    const el = bodyRef.current;
    const start = el?.selectionStart ?? content.length;
    const end = el?.selectionEnd ?? content.length;
    setContent(content.slice(0, start) + token + content.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

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

  const handleArchive = async () => {
    const ok = await confirm({
      title: `Archive “${displayLabel}”?`,
      description: managedBy
        ? `It moves to Trash, where you can restore it. ${managedBy} uses this template and will not send until it is restored or replaced.`
        : "It moves to Trash, where you can restore it. It disappears from your template lists and pickers, and anything that sends it (a sequence step, a single send, a managed reply) stops until it is restored or replaced.",
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await archiveNow();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setSaveError(message);
      toast.error(`Could not archive the template: ${message}`);
    }
  };

  const copyText = () =>
    [savedSubject ? `Subject: ${savedSubject}` : null, saved.content ?? ""]
      .filter((part): part is string => part !== null)
      .join("\n\n");

  const managedNotice =
    managedBy || note ? (
      <div className="flex gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="space-y-0.5">
          {managedBy && (
            <p className="font-medium text-foreground">
              Used by {managedBy}
              {mode === "edit" && (
                <span className="font-normal text-muted-foreground">
                  {" "}
                  — saving changes what {managedBy} sends.
                </span>
              )}
            </p>
          )}
          {note && <p className="text-muted-foreground">{note}</p>}
        </div>
      </div>
    ) : null;

  const metaLine = (
    <span className="text-xs text-muted-foreground">
      {[updated ? `Updated ${updated}` : null, `Version ${saved.version}`]
        .filter(Boolean)
        .join(" · ")}
    </span>
  );

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
                  label: "Archive",
                  icon: Archive,
                  onPress: handleArchive,
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
          <div className="mx-auto max-w-4xl space-y-3 px-4 pb-16 pt-3">
            {mode === "view" ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {showRole && saved.role && (
                    <Badge variant="outline" className="text-xs capitalize">
                      {saved.role} message
                    </Badge>
                  )}
                  <Badge variant="secondary" className="text-xs">
                    {isPubliclyVisible(saved.visibility)
                      ? "Shared with everyone"
                      : "Only you"}
                  </Badge>
                  {(saved.tags ?? []).map((tag) => (
                    <Badge key={tag} variant="outline" className="text-xs">
                      {tag}
                    </Badge>
                  ))}
                  {metaLine}
                  <div className="ml-auto">
                    <CopyButtons
                      size="sm"
                      label={`Message template ${displayLabel}`}
                      human={copyText}
                      json={() => saved}
                      agent={() =>
                        buildMessageTemplateScope({
                          template: saved,
                          canEdit: false,
                          mode: "view",
                          draft: savedDraft,
                          isDirty: false,
                          saveError: null,
                        }).message_template as string
                      }
                    />
                  </div>
                </div>

                {managedNotice}

                <MessagePreview subject={savedSubject} body={saved.content ?? ""} />
              </>
            ) : (
              <>
                {managedNotice}

                <div
                  className={cn(
                    "grid grid-cols-1 gap-3",
                    showRole && "sm:grid-cols-[1fr_12rem]",
                  )}
                >
                  <div className="space-y-1">
                    <Label htmlFor="template-name">Name</Label>
                    <ProInput
                      id="template-name"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="What this template is for"
                      className="text-base sm:text-sm"
                    />
                  </div>
                  {showRole && (
                    <div className="space-y-1">
                      <Label htmlFor="template-role">Message role</Label>
                      <Select
                        value={role ?? undefined}
                        onValueChange={(v) => setRole(v as MessageRole)}
                      >
                        <SelectTrigger
                          id="template-role"
                          className="h-9 bg-transparent text-base shadow-sm sm:text-sm"
                        >
                          <SelectValue placeholder="Who says it" />
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
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="template-subject">Email subject</Label>
                  <ProInput
                    id="template-subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Optional — fields work here too"
                    className="text-base sm:text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-end justify-between gap-2">
                    <Label htmlFor="template-body">Message</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 gap-1">
                          <Plus className="h-3.5 w-3.5" />
                          Insert field
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-64">
                        <div className="max-h-[60dvh] overflow-y-auto">
                          {usedFields.length > 0 && (
                            <>
                              <DropdownMenuLabel>In this template</DropdownMenuLabel>
                              {usedFields.map((f) => (
                                <DropdownMenuItem
                                  key={`used-${f.path}`}
                                  onSelect={() => insertField(f.path)}
                                >
                                  {f.label}
                                </DropdownMenuItem>
                              ))}
                              <DropdownMenuSeparator />
                            </>
                          )}
                          <DropdownMenuLabel>Common fields</DropdownMenuLabel>
                          {COMMON_MERGE_FIELDS.filter(
                            (f) => !usedFields.some((u) => u.path === f.path),
                          ).map((f) => (
                            <DropdownMenuItem
                              key={f.path}
                              onSelect={() => insertField(f.path)}
                            >
                              {f.label}
                            </DropdownMenuItem>
                          ))}
                        </div>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <ProTextarea
                    id="template-body"
                    ref={bodyRef}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Write the message. Use Insert field for a value filled in when it is sent."
                    autoGrow
                    minHeight={160}
                    surfaceName={MESSAGE_TEMPLATE_SURFACE_NAME}
                    sourceFeature="chat"
                    getApplicationScope={getScope}
                    className="font-mono text-base leading-relaxed sm:text-sm"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Preview</Label>
                  <MessagePreview subject={subject.trim()} body={content} />
                </div>

                <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-1">
                    <Label htmlFor="template-tags">Tags</Label>
                    <ProInput
                      id="template-tags"
                      value={tagsInput}
                      onChange={(e) => setTagsInput(e.target.value)}
                      placeholder="Separate tags with commas"
                      className="text-base sm:text-sm"
                    />
                  </div>
                  <label className="matrx-tap-area flex h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
                    <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                    Share with everyone on AI Matrx
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {metaLine}
                  {!canSave && (
                    <span className="text-xs text-destructive">
                      A template needs a name and a message before it can be saved.
                    </span>
                  )}
                  {saveError && (
                    <span className="text-xs text-destructive">{saveError}</span>
                  )}
                </div>
              </>
            )}

            <EntityCustomFields
              entityToken="message_template"
              recordId={saved.id}
              organizationId={saved.organization_id}
            />
          </div>
        </div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
