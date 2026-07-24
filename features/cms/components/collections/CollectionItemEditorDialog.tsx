"use client";

/**
 * CollectionItemEditorDialog (W2-C) — schema-driven create/edit for ONE
 * collection item, so a human can add an event or fix a typo in a testimonial
 * without asking an agent.
 *
 * The form is built from the collection's `field_schema`: one correctly-typed
 * input per declared field, plus a raw-JSON escape hatch for keys the schema
 * does not declare (advisory collections legitimately carry them; strict ones
 * reject them, and the route says so).
 *
 * Validation runs in TWO places on purpose: this dialog previews the canonical
 * rules locally for instant feedback, and the route re-runs the SAME twin
 * (features/cms/collections/validateItem.ts) as the authority. The client
 * preview is a convenience and is never trusted — a 422 from the route always
 * wins and its field-level errors are what get pinned to the inputs.
 *
 * Mobile renders a Drawer, desktop a Dialog (house rule).
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  CmsCollectionService,
  ItemValidationError,
} from "@/features/cms/services/cmsService";
import type {
  CollectionFieldDef,
  SiteCollection,
  SiteCollectionItem,
} from "@/features/cms/types";
import {
  validateItem,
  type ItemValidationProblem,
} from "@/features/cms/collections/validateItem";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { AlertCircle, Braces, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "@/lib/toast";

interface ItemEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: SiteCollection;
  /** null = create mode */
  item: SiteCollectionItem | null;
  onSaved: () => void | Promise<void>;
}

/** Own-property read — a schema key shadowing a prototype member must not leak. */
function readField(
  data: Record<string, unknown> | null | undefined,
  key: string,
): unknown {
  if (!data) return undefined;
  return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : undefined;
}

/** Seed the form state from an existing item (or empty for create). */
function initialValues(
  fields: CollectionFieldDef[],
  item: SiteCollectionItem | null,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of fields) {
    const raw = readField(item?.data, field.key);
    if (raw === undefined || raw === null) {
      values[field.key] = "";
      continue;
    }
    if (field.type === "boolean") {
      values[field.key] = raw === true ? "true" : "false";
      continue;
    }
    values[field.key] =
      typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
  }
  return values;
}

/** Keys present on the item that the schema does not declare. */
function initialExtras(
  fields: CollectionFieldDef[],
  item: SiteCollectionItem | null,
): string {
  const declared = new Set(fields.map((f) => f.key));
  const extras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item?.data ?? {})) {
    if (!declared.has(key)) extras[key] = value;
  }
  return Object.keys(extras).length > 0 ? JSON.stringify(extras, null, 2) : "";
}

/**
 * Turn the string-backed form state into the typed JSON the collection expects.
 * A field left blank is OMITTED rather than sent as "" — the canonical rules
 * treat "" as absence for string types but as a TYPE MISMATCH on number and
 * boolean, so sending blanks would invent failures the visitor path never has.
 */
function buildData(
  fields: CollectionFieldDef[],
  values: Record<string, string>,
  extrasJson: string,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const data: Record<string, unknown> = {};
  for (const field of fields) {
    const raw = values[field.key] ?? "";
    if (field.type === "boolean") {
      // A boolean switch always has a value; only send it when the item is
      // being given one, which for a switch means "always".
      data[field.key] = raw === "true";
      continue;
    }
    if (raw.trim() === "") continue; // omit — see the doc comment
    if (field.type === "number") {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        return { ok: false, error: `${field.label || field.key} must be a number` };
      }
      data[field.key] = n;
      continue;
    }
    if (field.type === "json") {
      try {
        data[field.key] = JSON.parse(raw);
      } catch {
        return {
          ok: false,
          error: `${field.label || field.key} is not valid JSON`,
        };
      }
      continue;
    }
    data[field.key] = raw;
  }

  if (extrasJson.trim() !== "") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(extrasJson);
    } catch {
      return { ok: false, error: "Additional data is not valid JSON" };
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: "Additional data must be a JSON object" };
    }
    for (const [key, value] of Object.entries(parsed)) data[key] = value;
  }
  return { ok: true, data };
}

export function CollectionItemEditorDialog({
  open,
  onOpenChange,
  collection,
  item,
  onSaved,
}: ItemEditorProps) {
  const isMobile = useIsMobile();
  const fields = useMemo(
    () => collection.field_schema ?? [],
    [collection.field_schema],
  );

  const [values, setValues] = useState<Record<string, string>>({});
  const [extrasJson, setExtrasJson] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ItemValidationProblem[]>([]);

  useEffect(() => {
    if (!open) return;
    setValues(initialValues(fields, item));
    setExtrasJson(initialExtras(fields, item));
    setFormError(null);
    setFieldErrors([]);
  }, [open, item, fields]);

  const set = (key: string, value: string) =>
    setValues((v) => ({ ...v, [key]: value }));

  /** Local preview of the canonical rules — the route remains the authority. */
  const preview = useMemo(() => {
    const built = buildData(fields, values, extrasJson);
    if (!built.ok) return null;
    return validateItem(fields, built.data, collection.validation_mode);
  }, [fields, values, extrasJson, collection.validation_mode]);

  const errorFor = (key: string): string | null => {
    const pinned = fieldErrors.find((e) => e.key === key);
    return pinned ? pinned.message : null;
  };

  const handleSave = async () => {
    const built = buildData(fields, values, extrasJson);
    if (!built.ok) {
      setFormError(built.error);
      return;
    }
    setFormError(null);
    setFieldErrors([]);
    setIsSaving(true);
    try {
      if (item) {
        const { validationWarnings } = await CmsCollectionService.updateItem(
          item.id,
          built.data,
        );
        toast.success("Item updated");
        if (validationWarnings.length > 0) {
          toast.warning(
            `Saved with ${validationWarnings.length} advisory warning(s) — this collection accepts them.`,
          );
        }
      } else {
        const { quarantined, validationWarnings } =
          await CmsCollectionService.createItem(collection.id, built.data);
        if (quarantined) {
          toast.warning(
            "Item saved, but the collection is at its item quota — it landed in Archived rather than being rejected.",
            { duration: 10_000 },
          );
        } else {
          toast.success("Item added");
        }
        if (validationWarnings.length > 0) {
          toast.warning(
            `Saved with ${validationWarnings.length} advisory warning(s) — this collection accepts them.`,
          );
        }
      }
      await onSaved();
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ItemValidationError) {
        // The route is the authority — pin ITS errors to the inputs.
        setFieldErrors(err.validationErrors);
        setFormError(err.message);
      } else {
        setFormError(err instanceof Error ? err.message : "Failed to save item");
      }
    } finally {
      setIsSaving(false);
    }
  };

  const renderField = (field: CollectionFieldDef) => {
    const value = values[field.key] ?? "";
    const error = errorFor(field.key);
    const label = (
      <div className="flex items-center gap-1.5 mb-1.5">
        <label
          htmlFor={`item-field-${field.key}`}
          className="text-sm font-medium"
        >
          {field.label || field.key}
        </label>
        {field.required && (
          <span className="text-destructive text-xs" aria-hidden="true">
            *
          </span>
        )}
        <Badge variant="outline" className="text-[10px] font-mono">
          {field.type}
        </Badge>
      </div>
    );

    let control: React.ReactNode;
    if (field.type === "boolean") {
      control = (
        <Switch
          id={`item-field-${field.key}`}
          checked={value === "true"}
          onCheckedChange={(v) => set(field.key, v ? "true" : "false")}
        />
      );
    } else if (field.type === "select") {
      control = (
        <select
          id={`item-field-${field.key}`}
          value={value}
          onChange={(e) => set(field.key, e.target.value)}
          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="">— none —</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    } else if (field.type === "richtext" || field.type === "json") {
      control = (
        <Textarea
          id={`item-field-${field.key}`}
          value={value}
          onChange={(e) => set(field.key, e.target.value)}
          rows={field.type === "json" ? 4 : 6}
          placeholder={field.type === "json" ? "{ }" : undefined}
          className={`text-sm ${field.type === "json" ? "font-mono" : ""}`}
        />
      );
    } else {
      const inputType =
        field.type === "number"
          ? "number"
          : field.type === "email"
            ? "email"
            : field.type === "url"
              ? "url"
              : field.type === "datetime"
                ? "datetime-local"
                : "text";
      control = (
        <Input
          id={`item-field-${field.key}`}
          type={inputType}
          value={value}
          onChange={(e) => set(field.key, e.target.value)}
          className="text-sm"
        />
      );
    }

    return (
      <div key={field.key}>
        {label}
        {control}
        {field.type === "datetime" && (
          <p className="text-xs text-muted-foreground mt-1">
            Stored as strict ISO-8601 (e.g. 2026-08-01T18:30:00Z).
          </p>
        )}
        {error && (
          <p className="text-xs text-destructive flex items-center gap-1 mt-1">
            <AlertCircle className="h-3 w-3 shrink-0" />
            {error}
          </p>
        )}
      </div>
    );
  };

  const body = (
    <div className="space-y-4">
      {fields.length === 0 && (
        <p className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-3">
          This collection declares no fields — author the item as raw JSON
          below.
        </p>
      )}
      {fields.map(renderField)}

      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Braces className="h-3.5 w-3.5 text-muted-foreground" />
          <label htmlFor="item-extras" className="text-sm font-medium">
            Additional data
          </label>
        </div>
        <Textarea
          id="item-extras"
          value={extrasJson}
          onChange={(e) => setExtrasJson(e.target.value)}
          rows={3}
          placeholder="{ }"
          className="text-sm font-mono"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Keys not declared in the field schema.
          {collection.validation_mode === "strict"
            ? " This collection is strict — undeclared keys will be rejected."
            : " This collection is advisory — undeclared keys are accepted."}
        </p>
      </div>

      {preview && preview.warnings.length > 0 && (
        <div className="text-xs text-amber-600 dark:text-amber-500 flex items-start gap-2 p-3 rounded-md bg-amber-500/10">
          <TriangleAlert className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">
              {preview.warnings.length} advisory warning(s) — this collection
              accepts the item anyway.
            </p>
            <ul className="mt-1 space-y-0.5">
              {preview.warnings.slice(0, 5).map((w, i) => (
                <li key={`${w.key}-${i}`}>{w.message}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {formError && (
        <div className="text-sm text-destructive flex items-center gap-2 p-3 rounded-md bg-destructive/10">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {formError}
        </div>
      )}
    </div>
  );

  const title = item ? "Edit item" : "Add item";
  const description = item
    ? `Editing an item in "${collection.name}".`
    : `Authoring a new item in "${collection.name}".`;

  const footer = (
    <>
      <Button
        variant="outline"
        onClick={() => onOpenChange(false)}
        disabled={isSaving}
      >
        Cancel
      </Button>
      <Button onClick={handleSave} disabled={isSaving}>
        {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
        {item ? "Save changes" : "Add item"}
      </Button>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => !isSaving && onOpenChange(o)}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 overflow-y-auto">{body}</div>
          <DrawerFooter className="flex-row justify-end gap-2 pb-safe">
            {footer}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !isSaving && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
