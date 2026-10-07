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

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Archive, Eye, Info, Pencil, Plus, Save, X } from "lucide-react";
import { PUBLISH_TO_WEB_ACTION, publishedToWebLabel } from "@/lib/row-access";
import {
  type MessageRole,
  type MessageTemplateDB,
  readMessageTemplateMetadata,
} from "@/features/message-templates/types/message-templates-db";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { EntityCustomFields } from "@/features/unified-data/components/EntityCustomFields";
import {
  MERGE_FIELD_CHIP_CLASS,
  type MergeFieldInputHandle,
} from "@/components/merge-field-input/MergeFieldInput";
import { TemplateRichText } from "@/features/message-templates/components/TemplateRichText";
import { MergeFieldTextarea } from "@/components/merge-field-input/MergeFieldTextarea";
import { AgentAppTagsInput } from "@/features/agent-apps/components/inputs/AgentAppTagsInput";
import { Switch } from "@/components/ui/switch";
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
import { RichCopySplit } from "@/components/agent-copy/RichCopySplit";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { describeWriteFailure } from "@/lib/errors/writeFailure";
import {
  ensureOrganizationContext,
  isOrganizationSelectionCancelled,
} from "@/lib/organization/organization-gate";
import {
  createTemplate,
  updateTemplate,
  archiveTemplate,
  clearTemplateCache,
} from "@/features/message-templates/services/message-templates-service";
import { SurfaceRuntimeProvider } from "@ai-matrx/chat/surfaces/runtime/SurfaceRuntimeContext";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { MenuPresenceProvider } from "@/features/context-menu-v3/menu-presence";
import { CONTEXT_MENU_HEADING_KEY } from "@/features/context-menu-v3/types";
import type { RichDocumentAction } from "@ai-matrx/rich-content/rich-document/types";
import { useUnsavedChangesGuard } from "@/lib/navigation/useUnsavedChangesGuard";
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
  type MergeFieldInfo,
  mergeFieldLabel,
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
  /** The saved row — or, in create mode, the starting values (a blank stub or the template being duplicated; its id is never written). */
  template: MessageTemplateDB;
  canEdit: boolean;
  /**
   * CREATE mode: the same editor, opened on a template that does not exist yet. Save inserts it
   * (in the person's organization) and lands on its page; Discard goes back to the list.
   */
  create?: boolean;
}

function draftFrom(template: MessageTemplateDB): MessageTemplateDraftScope {
  return {
    label: template.label ?? "",
    content: template.content ?? "",
    subject_template: templateSubject(template),
    role: template.role ?? null,
    tags: template.tags ?? [],
    // The draft key is the surface manifest's contract; the value reads the row word.
    visibility: template.published_to_web ? "public" : "private",
  };
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
            className={
              show === "names"
                ? MERGE_FIELD_CHIP_CLASS
                : "rounded bg-muted px-1 text-foreground"
            }
          >
            {show === "names" ? part.field.label : part.field.example}
          </span>
        ),
      )}
    </>
  );
}

type FieldShow = "names" | "example";

/** A template text with each merge field as "[Plain name]" — never raw {{…}}. */
function readable(text: string): string {
  return previewParts(text)
    .map((part) => (part.kind === "text" ? part.text : `[${part.field.label}]`))
    .join("");
}

/** Field names vs example values — one small toggle, never its own row. */
function ShowToggle({
  value,
  onChange,
}: {
  value: FieldShow;
  onChange: (v: FieldShow) => void;
}) {
  return (
    <Button
      icon={<Eye />}
      type="button"
      variant="quiet"
      aria-pressed={value === "example"}
      onClick={() => onChange(value === "example" ? "names" : "example")}
      className="shrink-0"
    >
      {value === "example" ? "Show fields" : "Show example"}
    </Button>
  );
}

/** Subject + body as a person reads them — rows of the one record surface. */
function MessageBody({
  subject,
  body,
  show,
}: {
  subject: string;
  body: string;
  show: FieldShow;
}) {
  return (
    <>
      {subject && (
        <div className="border-b border-border px-3 py-2 text-sm">
          <span className="text-muted-foreground">Subject </span>
          <FilledText text={subject} show={show} />
        </div>
      )}
      <div className="break-words px-3 py-3 text-sm leading-relaxed text-foreground">
        {body.trim() ? (
          <TemplateRichText text={body} show={show} />
        ) : (
          <span className="text-muted-foreground">The message is empty.</span>
        )}
      </div>
    </>
  );
}

/** Insert a field into ONE input — each field that takes fields has its own. */
function InsertFieldMenu({
  used,
  onInsert,
  target,
}: {
  used: MergeFieldInfo[];
  onInsert: (path: string) => void;
  target: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={<Plus />}
          variant="quiet"
          aria-label={`Insert a field into the ${target}`}
        >
          Insert field
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-64"
        // Focus goes back to the field (insertField), not to this trigger.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <div className="max-h-[60dvh] overflow-y-auto">
          {used.length > 0 && (
            <>
              <DropdownMenuLabel>In this template</DropdownMenuLabel>
              {used.map((f) => (
                <DropdownMenuItem key={`used-${f.path}`} onSelect={() => onInsert(f.path)}>
                  {f.label}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuLabel>Common fields</DropdownMenuLabel>
          {COMMON_MERGE_FIELDS.filter((f) => !used.some((u) => u.path === f.path)).map(
            (f) => (
              <DropdownMenuItem key={f.path} onSelect={() => onInsert(f.path)}>
                {f.label}
              </DropdownMenuItem>
            ),
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TemplateViewPage({ template, canEdit, create = false }: TemplateViewPageProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pageHref = create ? `${LIST_HREF}/new` : `${LIST_HREF}/${template.id}`;
  const editHref = `${pageHref}?mode=edit`;
  const mode: "view" | "edit" =
    create || (canEdit && searchParams.get("mode") === "edit") ? "edit" : "view";
  const [created, setCreated] = useState(false);
  // View ↔ Edit is one page: a shallow URL update (Next keeps useSearchParams
  // in sync with native history), never a server round-trip.
  const selectMode = (href: string) => {
    window.history.pushState(null, "", href);
  };

  // `saved` is the row as last saved — the server prop until this page saves.
  const [saved, setSaved] = useState<MessageTemplateDB>(template);
  const [label, setLabel] = useState(saved.label ?? "");
  const [content, setContent] = useState(saved.content ?? "");
  const [subject, setSubject] = useState(templateSubject(saved));
  const [role, setRole] = useState<MessageRole | null>(saved.role ?? null);
  const [isPublic, setIsPublic] = useState(saved.published_to_web === true);
  const [tags, setTags] = useState<string[]>(saved.tags ?? []);
  const [show, setShow] = useState<FieldShow>("names");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const bodyRef = useRef<MergeFieldInputHandle>(null);
  const subjectRef = useRef<MergeFieldInputHandle>(null);
  const nameRef = useRef<MergeFieldInputHandle>(null);

  const draft: MessageTemplateDraftScope = {
    label: label.trim(),
    content,
    subject_template: subject.trim(),
    role,
    tags,
    visibility: isPublic ? "public" : "private",
  };
  const savedDraft = draftFrom(saved);
  // A new template has nothing saved: it is "changed" the moment it has a name or a message.
  const isDirty = create ? Boolean(draft.label || content.trim()) && !created : !sameDraft(draft, savedDraft);
  const canSave = draft.label.length > 0 && content.trim().length > 0;
  const managedByKey = templateManagedBy(saved);
  const managedBy = managedByKey ? humanizeManagedBy(managedByKey) : null;
  const note = metadataText(saved.metadata, "note");
  const savedSubject = templateSubject(saved);
  const displayLabel = saved.label || (create ? "New template" : "Untitled template");
  // An email template (it has a subject) has no use for a chat-message role;
  // the role is shown only for a message template that has no subject.
  const isEmail = Boolean(savedSubject || subject.trim());
  const showRole = !isEmail;
  const usedFields = mergeFieldsIn(subject, content);
  const viewFields = mergeFieldsIn(templateSubject(saved), saved.content ?? "");
  const updated = saved.updated_at ? DATE_FORMAT.format(new Date(saved.updated_at)) : null;

  // Unsaved edits are never lost silently: refresh, the header Back, any
  // in-app link and browser Back all ask first (the platform guard).
  const { confirmDiscard } = useUnsavedChangesGuard({
    when: isDirty,
    what: "your changes to this template",
  });

  const resetDraft = () => {
    setLabel(saved.label ?? "");
    setContent(saved.content ?? "");
    setSubject(templateSubject(saved));
    setRole(saved.role ?? null);
    setIsPublic(saved.published_to_web === true);
    setTags(saved.tags ?? []);
    setSaveError(null);
  };

  const handleDiscard = async () => {
    if (!(await confirmDiscard({ discarding: true }))) return;
    if (create) {
      setCreated(true);
      router.push(LIST_HREF);
      return;
    }
    resetDraft();
    selectMode(pageHref);
  };

  // Which field the person is in, and what they have selected there — read
  // from the fields' own handles when an agent asks (never fetched).
  const liveFocus = () => {
    const fields: [string, MergeFieldInputHandle | null][] = [
      ["name", nameRef.current],
      ["email subject", subjectRef.current],
      ["message", bodyRef.current],
    ];
    for (const [field, handle] of fields) {
      if (!handle?.hasSelection()) continue;
      const text = handle.getValue();
      const { start, end } = handle.getSelection();
      const a = Math.min(start, end);
      const b = Math.max(start, end);
      return {
        field,
        selection: { text: text.slice(a, b), before: text.slice(0, a), after: text.slice(b) },
      };
    }
    return { field: null, selection: null };
  };

  const getScope = () =>
    buildMessageTemplateScope({
      template: saved,
      canEdit,
      mode,
      draft,
      isDirty,
      saveError,
      live: liveFocus(),
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
        if (next.tags !== undefined) setTags(next.tags);
        if (next.visibility !== undefined) setIsPublic(next.visibility === "public");
        if (mode !== "edit") selectMode(editHref);
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

  const handleSave = async () => {
    if (isSaving || !canSave || !isDirty) return;
    if (create) {
      setIsSaving(true);
      setSaveError(null);
      try {
        const row = await createTemplate({
          organization_id: await ensureOrganizationContext(),
          label: draft.label,
          content,
          role: role ?? "user",
          published_to_web: isPublic,
          tags: draft.tags,
          metadata: draft.subject_template ? { subject_template: draft.subject_template } : {},
        });
        clearTemplateCache();
        setCreated(true);
        toast.success("Template created");
        router.replace(`${LIST_HREF}/${row.id}`);
      } catch (err) {
        // Declining the organization question is an answer, not a failure.
        if (!isOrganizationSelectionCancelled(err)) {
          const message = describeWriteFailure(err, { action: "create this template" });
          setSaveError(`${message.title} ${message.description ?? ""}`.trim());
          toast.error(message.title);
        }
      } finally {
        setIsSaving(false);
      }
      return;
    }
    // Only what changed is written — an untouched body keeps its exact bytes
    // and an unset role stays unset.
    const patch: Parameters<typeof updateTemplate>[0] = { id: saved.id };
    if (draft.label !== savedDraft.label) patch.label = draft.label;
    if (content !== savedDraft.content) patch.content = content;
    if (role !== savedDraft.role && role) patch.role = role;
    if (draft.visibility !== savedDraft.visibility)
      patch.published_to_web = isPublic;
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
      setIsPublic(row.published_to_web === true);
      setTags(row.tags ?? []);
      toast.success("Template saved");
      selectMode(pageHref);
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
      <div className="flex gap-2 px-3 py-2 text-sm">
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

  // Each item keeps its own separator, so a wrap never strands a "·".
  // How many times it has been saved since it was made (version 1 = new).
  const edits = Math.max(0, (saved.version ?? 1) - 1);
  const metaItems = [
    updated ? `Updated ${updated}` : null,
    edits > 0 ? `Edited ${edits} ${edits === 1 ? "time" : "times"}` : null,
  ].filter((item): item is string => item !== null);
  // Each item is unbreakable; a "·" joins them only where they share a line
  // (sm+), so a wrap on a phone never strands a separator.
  const metaLine = (
    <span className="inline-flex flex-wrap gap-x-2 text-xs text-muted-foreground">
      {metaItems.map((item, i) => (
        <span key={item} className="whitespace-nowrap">
          {i > 0 && <span className="mr-2 hidden sm:inline">·</span>}
          {item}
        </span>
      ))}
    </span>
  );

  // The record as a person reads it — fields by name, never raw {{…}} — for
  // the right-click menu's header and its Copy.
  // In edit mode it is the DRAFT — Copy, Export and Save to Notes act on what
  // is on screen, not the last saved text.
  const menuSubject = mode === "edit" ? subject.trim() : savedSubject;
  const menuBody = mode === "edit" ? content : (saved.content ?? "");
  const readableText = [
    menuSubject ? `Subject: ${readable(menuSubject)}` : null,
    readable(menuBody),
  ]
    .filter((part): part is string => part !== null)
    .join("\n\n");

  // The page's own actions, in its right-click menu (view mode). Every one is a
  // SECOND door: the visible one is the header (Save / Discard pinned on phone,
  // the View/Edit mode switch, Archive), the unsaved-changes bar, and the
  // Show example toggle above the body — so each states renderSlot "overflow"
  // as a decision, never a default (check:hidden-primary-actions).
  const pageMenuActions: RichDocumentAction[] = [
    ...(canEdit && mode === "edit" && isDirty
      ? [
          {
            id: "message-template-save",
            label: "Save changes",
            icon: Save,
            category: "edit" as const,
            supportedSources: "*" as const,
            renderSlot: "overflow" as const,
            order: 0,
            run: () => void handleSave(),
          },
          {
            id: "message-template-discard",
            label: "Discard changes",
            icon: X,
            category: "edit" as const,
            supportedSources: "*" as const,
            renderSlot: "overflow" as const,
            order: 0.5,
            run: () => void handleDiscard(),
          },
        ]
      : []),
    ...(canEdit && mode === "view" && !create
      ? [
          {
            id: "message-template-edit",
            label: "Edit template",
            icon: Pencil,
            category: "edit" as const,
            supportedSources: "*" as const,
            renderSlot: "overflow" as const,
            order: 1,
            run: () => selectMode(editHref),
          },
        ]
      : []),
    ...((mode === "edit" ? usedFields : viewFields).length > 0
      ? [
          {
            id: "message-template-toggle-example",
            label: show === "example" ? "Show field names" : "Show example",
            icon: Eye,
            category: "edit" as const,
            supportedSources: "*" as const,
            renderSlot: "overflow" as const,
            order: 2,
            run: () => setShow(show === "example" ? "names" : "example"),
          },
        ]
      : []),
    ...(canEdit
      ? [
          {
            id: "message-template-archive",
            label: "Archive template",
            icon: Archive,
            category: "edit" as const,
            supportedSources: "*" as const,
            renderSlot: "overflow" as const,
            order: 3,
            run: () => void handleArchive(),
          },
        ]
      : []),
  ];

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
          canEdit && !create
            ? [
                { name: "View", href: pageHref, icon: Eye },
                { name: "Edit", href: editHref, icon: Pencil },
              ]
            : undefined
        }
        activeModeHref={mode === "edit" ? editHref : pageHref}
        onModeSelect={selectMode}
        modeSwitchOnPhone
        entityStatus={
          mode === "edit" || isDirty ? (
            // On a phone the pinned Save already says there are changes; the
            // words would only be clipped beside it.
            <span
              className={cn(
                "shrink-0 text-xs text-muted-foreground",
                isDirty && "hidden sm:inline",
              )}
            >
              {isSaving ? "Saving…" : isDirty ? "Unsaved changes" : "Saved"}
            </span>
          ) : undefined
        }
        actions={
          canEdit
            ? [
                // Save exists only when there is something to save; the
                // "Saved" state is the status text beside the name.
                // Discard is labelled and sits apart from Save (never an
                // unlabelled undo arrow beside it).
                ...(mode === "edit" && isDirty
                  ? [
                      {
                        label: "Discard",
                        icon: X,
                        showLabel: true,
                        pinnedOnPhone: true,
                        onPress: () => void handleDiscard(),
                      },
                      {
                        label: isSaving ? "Saving" : "Save",
                        icon: Save,
                        primary: true,
                        pinnedOnPhone: true,
                        disabled: isSaving || !canSave,
                        onPress: handleSave,
                      },
                    ]
                  : []),
                // Archive is a VIEW action; while editing it lives in the
                // record's right-click menu, never as a bare icon beside Save.
                ...(mode === "view" && !create
                  ? [{ label: "Archive", icon: Archive, onPress: handleArchive }]
                  : []),
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
        contextData={{ content: readableText }}
        // The header NAMES the record and shows it as a person reads it —
        // never the raw {{…}} the agent scope (content) carries.
        resolveContextOnOpen={() => ({
          [CONTEXT_MENU_HEADING_KEY]: { label: "Message template", text: readableText },
        })}
        extraRichActions={pageMenuActions}
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
              // ONE record surface: header row, the managing job, subject, body.
              <article className="overflow-hidden rounded-lg border border-border bg-card">
                {isDirty && (
                  <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-sm">
                    <Pencil className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      You have unsaved changes to this template. This view shows the saved version.
                    </span>
                    <Button variant="outline" onClick={() => selectMode(editHref)}>
                      Continue editing
                    </Button>
                    <Button variant="quiet" onClick={() => void handleDiscard()}>
                      Discard
                    </Button>
                  </div>
                )}
                <div className="flex items-start gap-2 border-b border-border px-3 py-2">
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                    {showRole && saved.role && (
                      <Badge variant="outline" className="text-xs font-normal capitalize text-muted-foreground">
                        {saved.role} message
                      </Badge>
                    )}
                    <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
                      {publishedToWebLabel(saved.published_to_web)}
                    </Badge>
                    {(saved.tags ?? []).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs font-normal">
                        {tag}
                      </Badge>
                    ))}
                    {metaLine}
                  </div>
                  {viewFields.length > 0 && <ShowToggle value={show} onChange={setShow} />}
                  <RichCopySplit
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
                {managedNotice && <div className="border-b border-border">{managedNotice}</div>}
                <MessageBody subject={savedSubject} body={saved.content ?? ""} show={show} />
                <div className="border-t border-border px-3 py-2">
                  <EntityCustomFields
                    entityToken="message_template"
                    recordId={saved.id}
                    organizationId={saved.organization_id}
                  />
                </div>
              </article>
            ) : (
              // In edit mode each field owns its right-click menu (the app's
              // editable menu with its text actions): the page's read-only
              // record menu would otherwise yield to the browser's native one
              // inside a text field.
              <MenuPresenceProvider value={false}>
                {managedNotice && (
                  <div className="overflow-hidden rounded-lg border border-border">{managedNotice}</div>
                )}

                <div
                  className={cn(
                    "grid grid-cols-1 gap-3",
                    showRole && "sm:grid-cols-[1fr_12rem]",
                  )}
                >
                  <div className="space-y-1">
                    <Label id="template-name-label">Name</Label>
                    <MergeFieldTextarea
                      ref={nameRef}
                      aria-labelledby="template-name-label"
                      multiline={false}
                      value={label}
                      onChange={setLabel}
                      fieldLabel={mergeFieldLabel}
                      placeholder="What this template is for"
                      surfaceName={MESSAGE_TEMPLATE_SURFACE_NAME}
                      sourceFeature="chat"
                      getApplicationScope={getScope}
                      auxiliaryControlsLabel="name"
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
                  <div className="flex items-center justify-between gap-2">
                    <Label id="template-subject-label">Email subject</Label>
                    <InsertFieldMenu
                      target="email subject"
                      used={usedFields}
                      onInsert={(path) => subjectRef.current?.insertField(path)}
                    />
                  </div>
                  <MergeFieldTextarea
                    ref={subjectRef}
                    aria-labelledby="template-subject-label"
                    multiline={false}
                    value={subject}
                    onChange={setSubject}
                    fieldLabel={mergeFieldLabel}
                    placeholder="Optional"
                    surfaceName={MESSAGE_TEMPLATE_SURFACE_NAME}
                    sourceFeature="chat"
                    getApplicationScope={getScope}
                    auxiliaryControlsLabel="email subject"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <Label id="template-body-label">Message</Label>
                    <span className="flex-1" />
                    {usedFields.length > 0 && <ShowToggle value={show} onChange={setShow} />}
                    <InsertFieldMenu
                      target="message"
                      used={usedFields}
                      onInsert={(path) => bodyRef.current?.insertField(path)}
                    />
                  </div>
                  <MergeFieldTextarea
                    ref={bodyRef}
                    aria-labelledby="template-body-label"
                    value={content}
                    onChange={setContent}
                    fieldLabel={mergeFieldLabel}
                    placeholder="Write the message. Use Insert field for a value filled in when it is sent."
                    surfaceName={MESSAGE_TEMPLATE_SURFACE_NAME}
                    sourceFeature="chat"
                    getApplicationScope={getScope}
                    auxiliaryControlsLabel="message"
                  />
                </div>

                {/* The editor already names every field; the preview earns its
                    place only as the filled-in example. */}
                {usedFields.length > 0 && show === "example" && (
                  <section
                    aria-label="Example with sample values"
                    className="overflow-hidden rounded-lg border border-border bg-card"
                  >
                    <div className="border-b border-border px-3 py-1.5 text-xs font-medium text-muted-foreground">
                      Example with sample values
                    </div>
                    <MessageBody subject={subject.trim()} body={content} show="example" />
                  </section>
                )}

                <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto]">
                  <div className="space-y-1">
                    <Label>Tags</Label>
                    <EditableContextMenu
                      sourceFeature="chat"
                      surfaceName={MESSAGE_TEMPLATE_SURFACE_NAME}
                      getApplicationScope={getScope}
                      contextData={{ content: tags.join(", ") }}
                    >
                      <div>
                        <AgentAppTagsInput
                          value={tags}
                          onChange={setTags}
                          placeholder="Add a tag and press Enter"
                        />
                      </div>
                    </EditableContextMenu>
                  </div>
                  <label className="matrx-tap-area flex h-9 cursor-pointer items-center gap-2 text-sm text-foreground">
                    <Switch checked={isPublic} onCheckedChange={setIsPublic} />
                    {PUBLISH_TO_WEB_ACTION}
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
                    <span className="text-xs text-destructive">
                      {saveError}
                      <ErrorAlchemyMenu error={saveError} size="xs" />
                    </span>
                  )}
                </div>
              </MenuPresenceProvider>
            )}

            {mode === "edit" && !create && (
              <section className="rounded-lg border border-border bg-card px-3 py-2">
                <EntityCustomFields
                  entityToken="message_template"
                  recordId={saved.id}
                  organizationId={saved.organization_id}
                />
              </section>
            )}
          </div>
        </div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}
