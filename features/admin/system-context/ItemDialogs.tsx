"use client";

// Authoring dialogs for System Context Items — create an item (definition +
// feed + optional value) and edit an item. Items live in
// `context.system_context_item` (one row = one item + its one current value);
// all write paths go through /api/admin/system-context.
//
// There is no "create category" here: the three classes (ambient / curated /
// dataset) are fixed, and ambient items are seeded by the platform.

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { recordToast, toast } from "@/lib/toast";

import { Input } from "@ai-matrx/design-system/controls";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  SystemContextItem,
  SystemItemClass,
} from "@/app/api/admin/system-context/route";
import {
  FeedConfigEditor,
  asFeedConfig,
  type FeedType,
  type FeedConfig,
} from "./FeedConfigEditor";
import {
  CLASS_META,
  Field,
  SENSITIVITY_HINT,
  SENSITIVITY_OPTIONS,
  VALUE_TYPE_OPTIONS,
  type Sensitivity,
  type ValueType,
} from "./shared";
import { ProTextarea } from "@/components/official/ProTextarea";

// Serialize the editor value to the raw string the API coerces per value_type.
function valueToRaw(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

const SHORT_VALUE_TYPES = new Set<ValueType>([
  "number",
  "percent",
  "currency",
  "boolean",
  "date",
  "datetime",
  "time",
  "email",
  "url",
  "phone",
  "color",
]);

// Text and Markdown are written in a real box. A one-line input clips a
// platform truth the moment it is longer than the field.
function ManualValueEditor({
  valueType,
  value,
  onChange,
  placeholder,
}: {
  valueType: ValueType;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  if (valueType === "object" || valueType === "array") {
    return (
      <Textarea
        mono
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        autoGrow
        minHeight={160}
        maxHeight={360}
        placeholder={placeholder ?? (valueType === "object" ? "{ }" : "[ ]")}
      />
    );
  }
  if (SHORT_VALUE_TYPES.has(valueType)) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    );
  }
  return (
    <ProTextarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      autoGrow
      minHeight={160}
      maxHeight={360}
      placeholder={
        placeholder ??
        (valueType === "markdown"
          ? "# Heading\n\nWrite the Markdown value…"
          : "Write the value…")
      }
    />
  );
}

// Edit the DEFINITION + FEED of an item. For manual feeds it also edits the
// value (a plain UPDATE — the platform version trigger keeps history).
export function EditItemDialog({
  item,
  onClose,
  onSaved,
}: {
  item: SystemContextItem;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(item.display_name);
  const [description, setDescription] = useState(item.description ?? "");
  const [sensitivity, setSensitivity] = useState<Sensitivity>(item.sensitivity);
  const [feedType, setFeedType] = useState<FeedType>(item.feed_type);
  const [feedConfig, setFeedConfig] = useState<FeedConfig>(
    asFeedConfig(item.feed_config),
  );
  const [value, setValue] = useState<string>(item.current_value ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      // 1. The definition + feed.
      const patchRes = await fetch("/api/admin/system-context", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          display_name: displayName,
          description,
          sensitivity,
          feed_type: feedType,
          feed_config: feedConfig,
        }),
      });
      if (!patchRes.ok) {
        const { error } = await patchRes
          .json()
          .catch(() => ({ error: patchRes.statusText }));
        toast.error(`Save failed: ${error}`);
        return;
      }
      // 2. Manual feeds also carry the value.
      if (feedType === "manual" && !item.is_computed) {
        const vRes = await fetch("/api/admin/system-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "set_value",
            itemId: item.id,
            value,
          }),
        });
        if (!vRes.ok) {
          const { error } = await vRes
            .json()
            .catch(() => ({ error: vRes.statusText }));
          toast.error(`Saved definition, but value failed: ${error}`);
          return;
        }
      }
      recordToast.success(
        { type: "system_context_item", id: item.id, title: item.key },
        `Updated ${item.key}.`,
      );
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
              {item.key}
            </code>
          </DialogTitle>
          <DialogDescription>
            Edit the definition and how it&apos;s populated
            {feedType === "manual" ? ", including its value" : ""}. Class:{" "}
            <span className="font-medium">
              {CLASS_META[item.item_class]?.label ?? item.item_class}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <Field label="Display name">
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </Field>
          <Field label="Description" hint="Optional.">
            <ProTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="Sensitivity" hint={SENSITIVITY_HINT}>
            <Select
              value={sensitivity}
              onValueChange={(v) => setSensitivity(v as Sensitivity)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SENSITIVITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="rounded-md border border-border bg-muted/30 p-3">
            <FeedConfigEditor
              feedType={feedType}
              onFeedTypeChange={setFeedType}
              feedConfig={feedConfig}
              onFeedConfigChange={setFeedConfig}
            />
          </div>

          {feedType === "manual" && !item.is_computed && (
            <Field label="Value" hint="Each save keeps a version in history">
              <ManualValueEditor
                valueType={item.value_type}
                value={value}
                onChange={setValue}
              />
            </Field>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            icon={saving && <Loader2 className="animate-spin" />}
            variant="primary"
            type="button"
            onClick={save}
            disabled={saving}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Create a new System Context Item (curated or dataset — ambient items are
// platform-seeded).
export function AddItemDialog({
  presetClass,
  onClose,
  onSaved,
}: {
  presetClass: SystemItemClass | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [itemClass, setItemClass] = useState<SystemItemClass>(
    presetClass && presetClass !== "ambient" ? presetClass : "curated",
  );
  const [key, setKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [valueType, setValueType] = useState<ValueType>("string");
  const [sensitivity, setSensitivity] = useState<Sensitivity>("public");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [feedType, setFeedType] = useState<FeedType>(
    presetClass === "dataset" ? "dataset" : "manual",
  );
  const [feedConfig, setFeedConfig] = useState<FeedConfig>({});
  const [saving, setSaving] = useState(false);

  const isManual = feedType === "manual";
  const keyValid = key === "" || /^[a-z0-9_]+$/.test(key);

  // Class follows the feed where the mapping is fixed: a dataset feed IS the
  // dataset class; everything else is a curated truth.
  function handleFeedTypeChange(ft: FeedType) {
    setFeedType(ft);
    setItemClass(ft === "dataset" ? "dataset" : "curated");
  }

  async function save() {
    if (!key.trim()) {
      toast.error("A key is required.");
      return;
    }
    if (!keyValid) {
      toast.error("Key may only use lowercase letters, numbers, underscores.");
      return;
    }
    if (!displayName.trim()) {
      toast.error("A display name is required.");
      return;
    }
    if (feedType === "dataset" && !feedConfig.data_store_id) {
      toast.error("Pick a knowledge resource for the dataset feed.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/system-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_item",
          key: key.trim().toLowerCase(),
          display_name: displayName.trim(),
          item_class: itemClass,
          value_type: isManual ? valueType : "string",
          sensitivity,
          description: description.trim(),
          feed_type: feedType,
          feed_config: isManual ? {} : feedConfig,
          value: isManual && value.trim() !== "" ? value : undefined,
        }),
      });
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: res.statusText }));
        toast.error(`Create failed: ${error}`);
        return;
      }
      toast.success(`Created item "${key.trim().toLowerCase()}".`);
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Add System Context Item</DialogTitle>
          <DialogDescription>
            A platform-wide truth any agent can receive.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Key"
              hint={keyValid ? "lowercase_with_underscores" : undefined}
              error={
                !keyValid ? "lowercase letters, numbers, _ only" : undefined
              }
            >
              <Input
                mono
                value={key}
                onChange={(e) => setKey(e.target.value)}
                data-identifier
                placeholder="company_name"
                autoFocus
              />
            </Field>
            <Field label="Display name">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Company Name"
              />
            </Field>
          </div>

          <Field label="Sensitivity" hint={SENSITIVITY_HINT}>
            <Select
              value={sensitivity}
              onValueChange={(v) => setSensitivity(v as Sensitivity)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SENSITIVITY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Description" hint="Optional.">
            <ProTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this truth represents and where it's used."
            />
          </Field>

          {/* The feed — how this item is populated. Class follows the feed. */}
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <FeedConfigEditor
              feedType={feedType}
              onFeedTypeChange={handleFeedTypeChange}
              feedConfig={feedConfig}
              onFeedConfigChange={setFeedConfig}
            />
            <p className="mt-2 text-[11px] text-muted-foreground">
              Class:{" "}
              <span className="font-medium">{CLASS_META[itemClass].label}</span>{" "}
              — {CLASS_META[itemClass].description}
            </p>
          </div>

          {isManual && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Value type">
                  <Select
                    value={valueType}
                    onValueChange={(v) => setValueType(v as ValueType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VALUE_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <Field
                label="Initial value"
                hint="Optional — you can set it later."
              >
                <ManualValueEditor
                  valueType={valueType}
                  value={value}
                  onChange={setValue}
                  placeholder={valueType === "string" ? "AI Matrx" : undefined}
                />
              </Field>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            icon={saving && <Loader2 className="animate-spin" />}
            variant="primary"
            type="button"
            onClick={save}
            disabled={saving}
          >
            Create item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
