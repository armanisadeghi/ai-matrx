"use client";

import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EnhancedEditableJsonViewer } from "@/components/ui/JsonComponents/JsonEditor";
import { Lock, Trash2 } from "lucide-react";
import type { AiSettingFormData } from "../../types";

const VISIBILITY_OPTIONS: Array<{
  value: AiSettingFormData["visibility"];
  label: string;
}> = [
  { value: "personal", label: "Personal" },
  { value: "internal", label: "Internal" },
  { value: "link", label: "Link" },
  { value: "public", label: "Public" },
];

interface SettingFormProps {
  data: AiSettingFormData;
  isNew: boolean;
  isSystem: boolean;
  saving: boolean;
  isDirty?: boolean;
  onChange: (data: AiSettingFormData) => void;
  onDelete?: () => Promise<void>;
}

function FormField({
  label,
  children,
  required,
  description,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  description?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
        {required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {children}
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

/**
 * A single-key `{ value: ... }` wrapper around a field so EnhancedEditableJsonViewer
 * (which only accepts a plain object at its root — see EditableJsonViewer's
 * isJsonObject guard in components/ui/JsonComponents/JsonEditor.tsx) can safely
 * edit fields whose real value is an array or a JSON primitive (canonical_values,
 * default_value). Plain-object fields (ui) don't need the wrapper.
 */
function JsonValueField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const wrapped = { value: value ?? null };
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <div className="rounded-md border bg-muted/20 p-2">
        <EnhancedEditableJsonViewer
          data={wrapped}
          onChange={(updated) => {
            if (
              typeof updated === "object" &&
              updated !== null &&
              "value" in updated
            ) {
              onChange((updated as { value: unknown }).value);
            }
          }}
          hideHeader
        />
      </div>
    </div>
  );
}

function JsonObjectField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <div className="rounded-md border bg-muted/20 p-2">
        <EnhancedEditableJsonViewer
          data={value}
          onChange={(updated) => {
            if (typeof updated === "object" && updated !== null) {
              onChange(updated as Record<string, unknown>);
            }
          }}
          hideHeader
        />
      </div>
    </div>
  );
}

export default function SettingForm({
  data,
  isNew,
  isSystem,
  saving,
  isDirty = true,
  onChange,
  onDelete,
}: SettingFormProps) {
  const set =
    (key: keyof AiSettingFormData) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...data, [key]: e.target.value });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Key" required description="Canonical setting name">
          <Input
            value={data.key}
            onChange={set("key")}
            placeholder="e.g. temperature"
            className="h-8 text-sm font-mono"
          />
        </FormField>
        <FormField
          label="Value Type"
          required
          description="e.g. number, string, boolean, enum, integer"
        >
          <Input
            value={data.value_type}
            onChange={set("value_type")}
            placeholder="e.g. number"
            className="h-8 text-sm font-mono"
          />
        </FormField>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Visibility">
          <Select
            value={data.visibility}
            onValueChange={(v) =>
              onChange({
                ...data,
                visibility: v as AiSettingFormData["visibility"],
              })
            }
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue placeholder="Select visibility…" />
            </SelectTrigger>
            <SelectContent>
              {VISIBILITY_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Origin
          </Label>
          <div className="h-8 flex items-center">
            {isSystem ? (
              <Badge
                variant="outline"
                className="text-xs gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800"
              >
                <Lock className="h-3 w-3" />
                System
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                Custom
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Not user-editable — set by the platform.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FormField
          label="Canonical Min"
          description="Lower bound for numeric value types"
        >
          <Input
            type="number"
            value={data.canonical_min}
            onChange={set("canonical_min")}
            placeholder="e.g. 0"
            className="h-8 text-sm font-mono"
          />
        </FormField>
        <FormField
          label="Canonical Max"
          description="Upper bound for numeric value types"
        >
          <Input
            type="number"
            value={data.canonical_max}
            onChange={set("canonical_max")}
            placeholder="e.g. 2"
            className="h-8 text-sm font-mono"
          />
        </FormField>
      </div>

      <FormField label="Description">
        <Textarea
          value={data.description}
          onChange={set("description")}
          placeholder="What this setting controls…"
          className="text-sm min-h-[70px]"
        />
      </FormField>

      <JsonValueField
        label="Canonical Values"
        description="Allowed values when value_type is enum-like (edited as { value: [...] })"
        value={data.canonical_values}
        onChange={(v) =>
          onChange({
            ...data,
            canonical_values: Array.isArray(v) ? v : v == null ? [] : [v],
          })
        }
      />

      <JsonValueField
        label="Default Value"
        description="Default applied when a model/offering doesn't override this setting"
        value={data.default_value}
        onChange={(v) => onChange({ ...data, default_value: v })}
      />

      <JsonObjectField
        label="UI Hints"
        description="Rendering hints (e.g. label, widget, step, group)"
        value={data.ui}
        onChange={(v) => onChange({ ...data, ui: v })}
      />

      {/* Delete — only in edit mode */}
      {!isNew && onDelete && (
        <div className="pt-1">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={isSystem}
                title={
                  isSystem
                    ? "System settings can't be deleted"
                    : "Delete this setting"
                }
                className="h-8 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete Setting
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Setting?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{data.key}</strong>{" "}
                  from the canonical settings vocabulary. This action cannot
                  be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={onDelete}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Delete Setting
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
