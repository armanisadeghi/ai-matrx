"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Check, GitCompareArrows, Save, X } from "lucide-react";
import { Button } from "@/components/ui/ButtonMine";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { RefinableContentEditor } from "@/components/content-refine/RefinableContentEditor";
import { useRefinableContent } from "@/components/content-refine/useRefinableContent";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { MESSAGE_ROLES } from "@/features/message-templates/constants";
import {
  clearTemplateCache,
  createTemplate,
  fetchMessageTemplates,
  updateTemplate,
} from "@/features/message-templates/services/message-templates-service";
import type {
  MessageRole,
  MessageTemplateDB,
} from "@/features/message-templates/types/message-templates-db";
import { readMessageTemplateMetadata } from "@/features/message-templates/types/message-templates-db";
import { requireSelectedOrgId } from "@/lib/organizations/activeOrg";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  composeTemplateContent,
  isMessageRole,
  isTemplateUpdateMethod,
  templateDisplayName,
  type TemplateSaveMode,
  type TemplateUpdateMethod,
} from "./template-save";

interface QuickMessageTemplateSaveCoreProps {
  initialContent: string;
  defaultName?: string;
  defaultRole?: MessageRole;
  onCancel?: () => void;
  footerHost?: HTMLElement | null;
}

export function QuickMessageTemplateSaveCore({
  initialContent,
  defaultName,
  defaultRole = "assistant",
  onCancel,
  footerHost,
}: QuickMessageTemplateSaveCoreProps) {
  const refine = useRefinableContent({ initialContent });
  const openDiff = useOpenDiffViewerWindow();
  const [templates, setTemplates] = useState<MessageTemplateDB[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState<TemplateSaveMode>("create");
  const [updateMethod, setUpdateMethod] =
    useState<TemplateUpdateMethod>("append");
  const [selectedId, setSelectedId] = useState("");
  const [label, setLabel] = useState(
    defaultName?.trim() || "Assistant response",
  );
  const [role, setRole] = useState<MessageRole>(defaultRole);
  const [tagsText, setTagsText] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [savedTemplate, setSavedTemplate] = useState<MessageTemplateDB | null>(
    null,
  );

  const selectedTemplate = templates.find(
    (template) => template.id === selectedId,
  );

  useEffect(() => {
    let active = true;
    fetchMessageTemplates({ order_by: "updated_at", order_direction: "desc" })
      .then((rows) => {
        if (active) setTemplates(rows);
      })
      .catch((error: unknown) => {
        console.error("QuickMessageTemplateSave: load failed", error);
        if (active) toast.error("Failed to load message templates");
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selectExisting = (id: string) => {
    setSelectedId(id);
    const template = templates.find((candidate) => candidate.id === id);
    if (!template) return;
    setLabel(templateDisplayName(template));
    setRole(template.role ?? defaultRole);
    setTagsText((template.tags ?? []).join(", "));
    setIsPublic(template.visibility === "public");
  };

  const tags = tagsText
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const canSave =
    !isSaving &&
    refine.workingContent.trim().length > 0 &&
    label.trim().length > 0 &&
    (mode === "create" || Boolean(selectedTemplate));

  const save = async () => {
    if (!canSave) return;
    if (mode === "update" && updateMethod === "overwrite") {
      const accepted = await confirm({
        title: "Overwrite this message template?",
        description: `This replaces all content in ${selectedTemplate ? templateDisplayName(selectedTemplate) : "the selected template"}.`,
        confirmLabel: "Overwrite",
        variant: "destructive",
      });
      if (!accepted) return;
    }

    setIsSaving(true);
    try {
      let saved: MessageTemplateDB;
      if (mode === "create") {
        saved = await createTemplate({
          organization_id: requireSelectedOrgId(),
          label: label.trim(),
          content: refine.workingContent.trim(),
          role,
          tags,
          visibility: isPublic ? "public" : "internal",
          metadata: {},
        });
      } else {
        if (!selectedTemplate) throw new Error("Choose a template to update");
        saved = await updateTemplate({
          id: selectedTemplate.id,
          label: label.trim(),
          content: composeTemplateContent(
            selectedTemplate.content,
            refine.workingContent,
            updateMethod,
          ),
          role,
          tags,
          visibility: isPublic ? "public" : "internal",
          metadata: readMessageTemplateMetadata(selectedTemplate.metadata),
        });
      }
      clearTemplateCache();
      setSavedTemplate(saved);
      toast.success(
        mode === "create"
          ? "Message template created"
          : `Message template ${updateMethod === "append" ? "updated" : "overwritten"}`,
      );
    } catch (error: unknown) {
      console.error("QuickMessageTemplateSave: save failed", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to save message template",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const previewOverwrite = () => {
    if (!selectedTemplate) return;
    openDiff({
      original: selectedTemplate.content ?? "",
      modified: refine.workingContent,
      originalLabel: templateDisplayName(selectedTemplate),
      modifiedLabel: "Incoming",
      title: "Preview template overwrite",
      engine: "light",
      defaultView: "split",
    });
  };

  const footerActions = savedTemplate ? (
    <>
      <EntityRef
        token="message_template"
        id={savedTemplate.id}
        name={templateDisplayName(savedTemplate)}
        openInNewTab
      />
      <Button
        type="button"
        size="sm"
        onClick={onCancel}
        className="h-7 px-2 text-xs"
      >
        Done
      </Button>
    </>
  ) : (
    <>
      {onCancel ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isSaving}
          className="h-7 px-2 text-xs gap-1.5"
        >
          <X className="h-3.5 w-3.5" /> Cancel
        </Button>
      ) : null}
      <Button
        type="button"
        size="sm"
        onClick={save}
        disabled={!canSave}
        className="h-7 px-2 text-xs gap-1.5"
      >
        <Save className="h-3.5 w-3.5" />{" "}
        {isSaving
          ? "Saving…"
          : mode === "create"
            ? "Save Template"
            : "Update Template"}
      </Button>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {savedTemplate ? (
        <div className="flex shrink-0 items-center gap-2 rounded-md border border-green-500/30 bg-green-500/10 px-3 py-1.5 text-xs">
          <Check className="h-3.5 w-3.5 text-green-600" />
          Saved as{" "}
          <span className="font-semibold">
            {templateDisplayName(savedTemplate)}
          </span>
        </div>
      ) : null}

      <RefinableContentEditor
        refine={refine}
        readOnly={Boolean(savedTemplate)}
        placeholder="Refine the message template content…"
        className="min-h-0 flex-1"
        resetKeySuffix={savedTemplate?.id ?? "draft"}
      />

      {!savedTemplate ? (
        <div className="shrink-0 space-y-2">
          <div className="inline-flex h-8 overflow-hidden rounded-md border border-border">
            {(["create", "update"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setMode(value)}
                className={cn(
                  "px-3 text-xs font-medium transition-colors first:border-r first:border-border",
                  mode === value
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:bg-accent",
                )}
              >
                {value === "create" ? "New Template" : "Existing Template"}
              </button>
            ))}
          </div>

          {mode === "update" ? (
            <div className="grid gap-1">
              <Label htmlFor="qmts-template" className="text-xs">
                Template
              </Label>
              <Select
                value={selectedId}
                onValueChange={selectExisting}
                disabled={isLoading}
              >
                <SelectTrigger id="qmts-template" className="h-8 text-xs">
                  <SelectValue
                    placeholder={
                      isLoading ? "Loading templates…" : "Choose a template…"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-w-[min(90vw,520px)]">
                  {templates.length ? (
                    templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        {templateDisplayName(template)} ·{" "}
                        {template.role ?? "unassigned"}
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="__none" disabled>
                      No templates found
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_150px_minmax(0,1fr)_auto]">
            <div className="grid gap-1">
              <Label htmlFor="qmts-name" className="text-xs">
                Name
              </Label>
              <Input
                id="qmts-name"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                className="h-8 text-xs"
                style={{ fontSize: "16px" }}
              />
            </div>
            <div className="grid gap-1">
              <Label htmlFor="qmts-role" className="text-xs">
                Role
              </Label>
              <Select
                value={role}
                onValueChange={(value) => {
                  if (isMessageRole(value)) setRole(value);
                }}
              >
                <SelectTrigger id="qmts-role" className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MESSAGE_ROLES.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label htmlFor="qmts-tags" className="text-xs">
                Tags
              </Label>
              <Input
                id="qmts-tags"
                value={tagsText}
                onChange={(event) => setTagsText(event.target.value)}
                placeholder="sales, follow-up"
                className="h-8 text-xs"
                style={{ fontSize: "16px" }}
              />
            </div>
            <div className="flex items-end gap-2 pb-1">
              <Switch
                id="qmts-public"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
              <Label htmlFor="qmts-public" className="pb-0.5 text-xs">
                Public
              </Label>
            </div>
          </div>

          {mode === "update" && selectedTemplate ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <RadioGroup
                value={updateMethod}
                onValueChange={(value) => {
                  if (isTemplateUpdateMethod(value)) setUpdateMethod(value);
                }}
                className="flex gap-4"
              >
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem id="qmts-append" value="append" />
                  <Label htmlFor="qmts-append" className="text-xs font-normal">
                    Append
                  </Label>
                </div>
                <div className="flex items-center gap-1.5">
                  <RadioGroupItem id="qmts-overwrite" value="overwrite" />
                  <Label
                    htmlFor="qmts-overwrite"
                    className="text-xs font-normal"
                  >
                    Overwrite
                  </Label>
                </div>
              </RadioGroup>
              {updateMethod === "overwrite" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={previewOverwrite}
                  className="h-7 gap-1.5 text-xs"
                >
                  <GitCompareArrows className="h-3.5 w-3.5" />
                  Preview changes
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {footerHost ? (
        createPortal(
          <div className="flex items-center gap-2">{footerActions}</div>,
          footerHost,
        )
      ) : (
        <div className="flex shrink-0 items-center justify-end gap-2 pb-safe">
          {footerActions}
        </div>
      )}
    </div>
  );
}
