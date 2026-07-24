"use client";

/**
 * CollectionEditorDialog (W2-C) — create/edit a site collection definition:
 * name/slug/description, the field-schema builder (add/remove/reorder, per-type
 * constraints), validation mode, the public read/write policy toggles (with the
 * richtext × public_write block mirrored from the server rule), upsert/search
 * flags, and the settings overrides (honeypot field, retention days).
 *
 * Pure form component — the parent owns fetching and the save round-trip.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  CmsCollectionService,
  type CollectionUpsertParams,
} from "@/features/cms/services/cmsService";
import type {
  CollectionFieldDef,
  CollectionFieldType,
  SiteCollection,
} from "@/features/cms/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Eye,
  Loader2,
  Plus,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { toast } from "@/lib/toast";

const FIELD_TYPES: { value: CollectionFieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "richtext", label: "Rich text" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "email", label: "Email" },
  { value: "url", label: "URL" },
  { value: "datetime", label: "Date / time" },
  { value: "select", label: "Select" },
  { value: "json", label: "JSON" },
];

const TEXTISH_TYPES: readonly CollectionFieldType[] = [
  "text",
  "richtext",
  "email",
  "url",
];

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,62}$/;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 63);
}

interface EditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteId: string;
  /** null = create mode */
  collection: SiteCollection | null;
  /** Fires after a successful save. `mintedKey` true when the site data key was just generated. */
  onSaved: (saved: SiteCollection, mintedKey: boolean) => void;
}

interface FormState {
  name: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  fields: CollectionFieldDef[];
  strict: boolean;
  publicWrite: boolean;
  publicRead: boolean;
  publicReadFields: string[];
  allowUpsert: boolean;
  searchable: boolean;
  honeypotField: string;
  retentionDays: string;
}

function initialState(collection: SiteCollection | null): FormState {
  return {
    name: collection?.name ?? "",
    slug: collection?.slug ?? "",
    slugTouched: !!collection,
    description: collection?.description ?? "",
    fields: collection?.field_schema ? [...collection.field_schema] : [],
    strict: collection?.validation_mode === "strict",
    publicWrite: collection?.public_write ?? false,
    publicRead: collection?.public_read ?? false,
    publicReadFields: collection?.public_read_fields
      ? [...collection.public_read_fields]
      : [],
    allowUpsert: collection?.allow_upsert ?? false,
    searchable: collection?.searchable ?? false,
    honeypotField:
      typeof collection?.settings?.honeypot_field === "string"
        ? collection.settings.honeypot_field
        : "",
    retentionDays:
      typeof collection?.settings?.retention_days === "number"
        ? String(collection.settings.retention_days)
        : "",
  };
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
  disabledReason,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
        {disabled && disabledReason && (
          <p className="text-xs text-destructive flex items-center gap-1 mt-1">
            <ShieldAlert className="h-3 w-3 shrink-0" />
            {disabledReason}
          </p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

export function CollectionEditorDialog({
  open,
  onOpenChange,
  siteId,
  collection,
  onSaved,
}: EditorProps) {
  const [form, setForm] = useState<FormState>(() => initialState(collection));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(initialState(collection));
      setError(null);
    }
  }, [open, collection]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const hasRichtext = form.fields.some((f) => f.type === "richtext");
  const fieldKeys = useMemo(
    () => form.fields.map((f) => f.key).filter(Boolean),
    [form.fields],
  );

  const updateField = (index: number, patch: Partial<CollectionFieldDef>) =>
    setForm((f) => ({
      ...f,
      fields: f.fields.map((fd, i) => (i === index ? { ...fd, ...patch } : fd)),
    }));

  const moveField = (index: number, dir: -1 | 1) =>
    setForm((f) => {
      const next = [...f.fields];
      const target = index + dir;
      if (target < 0 || target >= next.length) return f;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...f, fields: next };
    });

  const removeField = (index: number) =>
    setForm((f) => {
      const removed = f.fields[index];
      return {
        ...f,
        fields: f.fields.filter((_, i) => i !== index),
        publicReadFields: f.publicReadFields.filter((k) => k !== removed?.key),
      };
    });

  const addField = () =>
    setForm((f) => ({
      ...f,
      fields: [...f.fields, { key: "", label: "", type: "text" }],
    }));

  const validate = (): string | null => {
    if (!form.name.trim()) return "Name is required";
    if (!SLUG_RE.test(form.slug))
      return "Slug must start with a lowercase letter or digit, then lowercase letters, digits, underscores, or hyphens (max 63 characters)";
    const seen = new Set<string>();
    for (const [i, f] of form.fields.entries()) {
      if (!f.key.trim()) return `Field ${i + 1} needs a key`;
      if (seen.has(f.key)) return `Duplicate field key "${f.key}"`;
      seen.add(f.key);
      if (!f.label.trim()) return `Field "${f.key}" needs a label`;
      if (f.type === "select" && (!f.options || f.options.length === 0))
        return `Select field "${f.key}" needs at least one option`;
    }
    if (hasRichtext && form.publicWrite)
      return "A collection with a richtext field cannot allow public writes";
    if (form.retentionDays && !/^\d+$/.test(form.retentionDays))
      return "Retention days must be a whole number";
    return null;
  };

  const handleSave = async () => {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const settings: Record<string, unknown> = {
        ...(collection?.settings ?? {}),
      };
      if (form.honeypotField.trim()) settings.honeypot_field = form.honeypotField.trim();
      else delete settings.honeypot_field;
      if (form.retentionDays.trim())
        settings.retention_days = Number(form.retentionDays);
      else delete settings.retention_days;

      const payload: CollectionUpsertParams = {
        name: form.name.trim(),
        slug: form.slug,
        description: form.description.trim() || null,
        fieldSchema: form.fields,
        validationMode: form.strict ? "strict" : "advisory",
        publicWrite: form.publicWrite,
        publicRead: form.publicRead,
        publicReadFields: form.publicRead
          ? form.publicReadFields.filter((k) => fieldKeys.includes(k))
          : form.publicReadFields,
        allowUpsert: form.allowUpsert,
        searchable: form.searchable,
        settings,
      };

      if (collection) {
        const saved = await CmsCollectionService.updateCollection(
          collection.id,
          payload,
        );
        toast.success(`Saved "${saved.name}"`);
        onSaved(saved, false);
      } else {
        const { collection: created, mintedDataApiKey } =
          await CmsCollectionService.createCollection({
            siteId,
            slug: form.slug,
            name: form.name.trim(),
            ...payload,
          });
        toast.success(`Created "${created.name}"`);
        onSaved(created, mintedDataApiKey);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save collection");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !isSaving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {collection ? `Edit "${collection.name}"` : "New Collection"}
          </DialogTitle>
          <DialogDescription>
            A named, site-scoped data collection — form submissions, events,
            testimonials, or agent-authored content.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Identity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1.5">Name</label>
              <Input
                value={form.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name,
                    slug: f.slugTouched ? f.slug : slugify(name),
                  }));
                }}
                placeholder="Contact Requests"
                className="text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">Slug</label>
              <Input
                value={form.slug}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    slug: e.target.value,
                    slugTouched: true,
                  }))
                }
                placeholder="contact_requests"
                className="text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1.5">
              Description
            </label>
            <Input
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional — what this collection holds"
              className="text-sm"
            />
          </div>

          {/* Field schema builder */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Fields</label>
              <Button
                variant="outline"
                size="sm"
                onClick={addField}
                className="gap-1.5 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Add field
              </Button>
            </div>
            {form.fields.length === 0 ? (
              <p className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-3">
                No fields yet. Fields define what each item carries — they are
                validation data, not database columns.
              </p>
            ) : (
              <div className="space-y-2">
                {form.fields.map((field, i) => (
                  <div
                    key={i}
                    className="rounded-md border border-border p-2.5 space-y-2 bg-muted/20"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        value={field.key}
                        onChange={(e) =>
                          updateField(i, { key: e.target.value })
                        }
                        placeholder="key"
                        className="text-xs font-mono h-8 w-32 flex-1 min-w-24"
                      />
                      <Input
                        value={field.label}
                        onChange={(e) =>
                          updateField(i, { label: e.target.value })
                        }
                        placeholder="Label"
                        className="text-xs h-8 w-32 flex-1 min-w-24"
                      />
                      <select
                        value={field.type}
                        onChange={(e) =>
                          updateField(i, {
                            type: e.target.value as CollectionFieldType,
                          })
                        }
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Checkbox
                          checked={field.required ?? false}
                          onCheckedChange={(v) =>
                            updateField(i, { required: v === true })
                          }
                        />
                        Required
                      </label>
                      <div className="flex items-center ml-auto">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={i === 0}
                          onClick={() => moveField(i, -1)}
                          aria-label="Move up"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          disabled={i === form.fields.length - 1}
                          onClick={() => moveField(i, 1)}
                          aria-label="Move down"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          onClick={() => removeField(i)}
                          aria-label="Remove field"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    {(TEXTISH_TYPES.includes(field.type) ||
                      field.type === "number" ||
                      field.type === "select") && (
                      <div className="flex flex-wrap items-center gap-2">
                        {TEXTISH_TYPES.includes(field.type) && (
                          <Input
                            type="number"
                            value={field.max_length ?? ""}
                            onChange={(e) =>
                              updateField(i, {
                                max_length: e.target.value
                                  ? Number(e.target.value)
                                  : undefined,
                              })
                            }
                            placeholder="Max length"
                            className="text-xs h-8 w-28"
                          />
                        )}
                        {field.type === "number" && (
                          <>
                            <Input
                              type="number"
                              value={field.min ?? ""}
                              onChange={(e) =>
                                updateField(i, {
                                  min: e.target.value
                                    ? Number(e.target.value)
                                    : undefined,
                                })
                              }
                              placeholder="Min"
                              className="text-xs h-8 w-24"
                            />
                            <Input
                              type="number"
                              value={field.max ?? ""}
                              onChange={(e) =>
                                updateField(i, {
                                  max: e.target.value
                                    ? Number(e.target.value)
                                    : undefined,
                                })
                              }
                              placeholder="Max"
                              className="text-xs h-8 w-24"
                            />
                          </>
                        )}
                        {field.type === "select" && (
                          <Input
                            value={(field.options ?? []).join(", ")}
                            onChange={(e) =>
                              updateField(i, {
                                options: e.target.value
                                  .split(",")
                                  .map((s) => s.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="Options (comma-separated)"
                            className="text-xs h-8 flex-1 min-w-40"
                          />
                        )}
                      </div>
                    )}
                    {field.type === "richtext" && form.publicWrite && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3 shrink-0" />
                        Rich text cannot be combined with public writes — turn
                        one of them off.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Policies */}
          <div className="rounded-md border border-border divide-y divide-border px-3">
            <ToggleRow
              label="Strict validation"
              hint="Reject submissions that fail the field rules. Advisory mode accepts them and records warnings."
              checked={form.strict}
              onChange={(v) => set("strict", v)}
            />
            <ToggleRow
              label="Public write"
              hint="Site visitors can submit items (forms, signups). Protected by the site data key, rate limits, and the honeypot."
              checked={form.publicWrite}
              onChange={(v) => set("publicWrite", v)}
              /**
               * Block ENABLING it, never block disabling it. A collection that
               * is already public_write and then gains a richtext field showed
               * an error telling you to turn this off — on a toggle that was
               * unclickable, an inescapable dead end.
               */
              disabled={hasRichtext && !form.publicWrite}
              disabledReason="Blocked: this collection has a richtext field. Public visitors never submit rich text."
            />
            <ToggleRow
              label="Public read"
              hint="Published pages can list items (events, testimonials). Only the fields you pick below are ever returned."
              checked={form.publicRead}
              onChange={(v) => set("publicRead", v)}
            />
            {form.publicRead && (
              <div className="py-2 space-y-1.5">
                <p className="text-sm font-medium">Publicly readable fields</p>
                <p className="text-xs text-amber-600 dark:text-amber-500 flex items-center gap-1">
                  <Eye className="h-3 w-3 shrink-0" />
                  Anyone on the internet can read the fields checked here. Never
                  include emails, phone numbers, or private notes.
                </p>
                {fieldKeys.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Add fields above first.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {fieldKeys.map((key) => (
                      <label
                        key={key}
                        className="flex items-center gap-1.5 text-xs font-mono"
                      >
                        <Checkbox
                          checked={form.publicReadFields.includes(key)}
                          onCheckedChange={(v) =>
                            set(
                              "publicReadFields",
                              v === true
                                ? [...form.publicReadFields, key]
                                : form.publicReadFields.filter((k) => k !== key),
                            )
                          }
                        />
                        {key}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            <ToggleRow
              label="Allow upsert"
              hint="Submissions carrying the same idempotency key update the existing row (autosave-style drafts) instead of creating duplicates."
              checked={form.allowUpsert}
              onChange={(v) => set("allowUpsert", v)}
            />
            <ToggleRow
              label="Searchable"
              hint="Maintain a full-text index over item data (costs a little on every write)."
              checked={form.searchable}
              onChange={(v) => set("searchable", v)}
            />
          </div>

          {/* Settings overrides */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Honeypot field
              </label>
              <Input
                value={form.honeypotField}
                onChange={(e) => set("honeypotField", e.target.value)}
                placeholder="e.g. website"
                className="text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground mt-1">
                A hidden form field bots fill in — non-empty submissions are
                flagged as spam silently.
              </p>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1.5">
                Retention (days)
              </label>
              <Input
                type="number"
                min={1}
                value={form.retentionDays}
                onChange={(e) => set("retentionDays", e.target.value)}
                placeholder="Keep forever"
                className="text-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Items older than this are cleaned up automatically. Leave empty
                to keep everything.
              </p>
            </div>
          </div>

          {error && (
            <div className="text-sm text-destructive flex items-center gap-2 p-3 rounded-md bg-destructive/10">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            {collection ? "Save changes" : "Create collection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
