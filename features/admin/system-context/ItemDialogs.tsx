"use client";

// Authoring dialogs for System Context — create a category (scope type),
// create an item (definition + feed + optional value), and edit an item.
// All write paths go through /api/admin/system-context, unchanged.

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";

import { Input } from "@/components/ui/input";
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
import { CustomComponentConfigurator } from "@/features/agents/components/variables-management/CustomComponentConfigurator";
import { buildScopeValuePayload } from "@/features/scope-system/utils/scopeValuePayload";
import { ContextValueInput } from "@/features/scopes/components/reference/ContextValueInput";
import { ReferenceConfigFields } from "@/features/scopes/components/reference/ReferenceConfigFields";
import type { VariableCustomComponent } from "@/features/agents/types/agent-definition.types";
import type {
  SystemContextCategory,
  SystemContextItem,
} from "@/app/api/admin/system-context/route";
import {
  FeedConfigEditor,
  asFeedConfig,
  type FeedType,
  type FeedConfig,
} from "./FeedConfigEditor";
import {
  Field,
  SENSITIVITY_OPTIONS,
  SYSTEM_CONTEXT_REFERENCE_TYPES,
  VALUE_TYPE_OPTIONS,
  type Sensitivity,
  type ValueType,
} from "./shared";

// Initial editor value: structured (parsed) for JSON/media custom components,
// raw string otherwise.
function initialEditorValue(item: SystemContextItem): unknown {
  const cur = item.current_value;
  if (cur == null) return "";
  const cc = item.custom_component as VariableCustomComponent | null;
  const structured =
    item.value_type === "object" ||
    item.value_type === "array" ||
    (cc != null && isMediaComponentType(cc.type));
  if (structured) {
    try {
      return JSON.parse(cur);
    } catch {
      return cur;
    }
  }
  return cur;
}

function isMediaComponentType(t: string | undefined): boolean {
  return (
    t === "image" ||
    t === "audio" ||
    t === "video" ||
    t === "youtube" ||
    t === "document"
  );
}

// Edit the DEFINITION + FEED of an item (not just a value). For manual feeds it
// also edits the value; other feeds edit only the definition/feed config.
export function EditItemDialog({
  item,
  categories,
  onClose,
  onSaved,
}: {
  item: SystemContextItem;
  categories: SystemContextCategory[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(item.display_name);
  const [description, setDescription] = useState(item.description);
  const [sensitivity, setSensitivity] = useState<Sensitivity>(item.sensitivity);
  const [feedType, setFeedType] = useState<FeedType>(item.feed_type);
  const [feedConfig, setFeedConfig] = useState<FeedConfig>(
    asFeedConfig(item.feed_config),
  );
  const [value, setValue] = useState<unknown>(() => initialEditorValue(item));
  const [allowedReferenceTypes, setAllowedReferenceTypes] = useState<string[]>(
    item.allowed_reference_types ?? [],
  );
  const [maxItems, setMaxItems] = useState(
    item.max_items != null ? String(item.max_items) : "1",
  );
  const [allowedScopeTypeIds, setAllowedScopeTypeIds] = useState<string[]>(
    item.allowed_scope_type_ids ?? [],
  );
  const [saving, setSaving] = useState(false);

  const isReferenceItem = item.value_type === "reference";
  const customComponent =
    (item.custom_component as VariableCustomComponent | null) ?? undefined;
  const orgScopeTypes = useMemo(
    () =>
      categories.map((c) => ({
        id: c.scope_type_id,
        label_singular: c.label_singular,
      })),
    [categories],
  );

  function toggleReferenceType(t: string) {
    setAllowedReferenceTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }
  function toggleAllowedScopeType(id: string) {
    setAllowedScopeTypeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save() {
    if (isReferenceItem && allowedReferenceTypes.length === 0) {
      toast.error("Select at least one reference type.");
      return;
    }
    setSaving(true);
    try {
      // 1. The definition + feed (+ reference-config for reference items).
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
          ...(isReferenceItem
            ? {
                allowed_reference_types: allowedReferenceTypes,
                max_items: Math.max(1, Number(maxItems) || 1),
                allowed_scope_type_ids: allowedReferenceTypes.includes("scope")
                  ? allowedScopeTypeIds
                  : null,
              }
            : {}),
        }),
      });
      if (!patchRes.ok) {
        const { error } = await patchRes
          .json()
          .catch(() => ({ error: patchRes.statusText }));
        toast.error(`Save failed: ${error}`);
        return;
      }
      // 2. Manual feeds also carry a value (new versioned row).
      if (feedType === "manual" && item.scope_id) {
        const valueColumns = buildScopeValuePayload(value, item.value_type);
        const vRes = await fetch("/api/admin/system-context", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "set_value",
            itemId: item.id,
            scopeId: item.scope_id,
            valueType: item.value_type,
            valueColumns,
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
      toast.success(`Updated ${item.key}.`);
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">
              {item.key}
            </code>
          </DialogTitle>
          <DialogDescription>
            Edit the definition and how it&apos;s populated
            {feedType === "manual" ? ", including its value" : ""}. In{" "}
            <span className="font-medium">{item.scope_type_label}</span>.
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
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </Field>
          <Field label="Sensitivity">
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

          {feedType === "manual" && isReferenceItem && (
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">
                Reference configuration
              </div>
              <ReferenceConfigFields
                allowedReferenceTypes={allowedReferenceTypes}
                onToggleReferenceType={toggleReferenceType}
                maxItems={maxItems}
                onMaxItemsChange={setMaxItems}
                allowedScopeTypeIds={allowedScopeTypeIds}
                onToggleAllowedScopeType={toggleAllowedScopeType}
                orgScopeTypes={orgScopeTypes}
                typeOptions={SYSTEM_CONTEXT_REFERENCE_TYPES}
              />
            </div>
          )}

          {feedType === "manual" && (
            <Field
              label="Value"
              hint={
                item.scope_id
                  ? "Saving inserts a new current version (history retained)."
                  : "No scope to write to."
              }
            >
              {isReferenceItem ? (
                item.scope_id ? (
                  <ContextValueInput
                    valueType="reference"
                    referenceConfig={{
                      allowed_reference_types: allowedReferenceTypes,
                      max_items: Math.max(1, Number(maxItems) || 1),
                      allowed_scope_type_ids: allowedScopeTypeIds.length
                        ? allowedScopeTypeIds
                        : null,
                    }}
                    scopeId={item.scope_id}
                    displayName={displayName || item.key}
                    value={value}
                    onChange={setValue}
                    minHeight={56}
                    maxHeight={400}
                  />
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    No scope to write to.
                  </p>
                )
              ) : (
                <ContextValueInput
                  valueType={item.value_type}
                  customComponent={customComponent}
                  displayName={displayName || item.key}
                  value={value}
                  onChange={setValue}
                  minHeight={56}
                  maxHeight={400}
                />
              )}
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
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Create a new System category (a scope type + its one value-holding scope).
export function NewScopeTypeDialog({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [singular, setSingular] = useState("");
  const [plural, setPlural] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!singular.trim()) {
      toast.error("A name is required.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/system-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_scope_type",
          label_singular: singular.trim(),
          label_plural: plural.trim() || singular.trim(),
          description: description.trim(),
        }),
      });
      if (!res.ok) {
        const { error } = await res
          .json()
          .catch(() => ({ error: res.statusText }));
        toast.error(`Create failed: ${error}`);
        return;
      }
      toast.success(`Created category "${singular.trim()}".`);
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New System category</DialogTitle>
          <DialogDescription>
            A platform-wide scope type (e.g. Company, Brand, Platform). Its
            items resolve for every user. Created as a system category in the
            member-less <code className="text-xs">matrx-system</code> org.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <Field label="Name (singular)">
            <Input
              value={singular}
              onChange={(e) => setSingular(e.target.value)}
              placeholder="Company"
              autoFocus
            />
          </Field>
          <Field label="Name (plural)" hint="Defaults to the singular name.">
            <Input
              value={plural}
              onChange={(e) => setPlural(e.target.value)}
              placeholder="Companies"
            />
          </Field>
          <Field label="Description" hint="Optional.">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What kind of platform-wide values live here."
            />
          </Field>
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
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Create category
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Create a new System context item (definition + component + optional value).
export function AddItemDialog({
  categories,
  preset,
  onClose,
  onSaved,
}: {
  categories: SystemContextCategory[];
  preset: SystemContextCategory | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [scopeTypeId, setScopeTypeId] = useState(preset?.scope_type_id ?? "");
  const [key, setKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [valueType, setValueType] = useState<ValueType>("string");
  const [sensitivity, setSensitivity] = useState<Sensitivity>("internal");
  const [description, setDescription] = useState("");
  const [customComponent, setCustomComponent] = useState<
    VariableCustomComponent | undefined
  >(undefined);
  const [value, setValue] = useState<unknown>("");
  const [feedType, setFeedType] = useState<FeedType>("dataset");
  const [feedConfig, setFeedConfig] = useState<FeedConfig>({});
  const [allowedReferenceTypes, setAllowedReferenceTypes] = useState<string[]>(
    [],
  );
  const [maxItems, setMaxItems] = useState("1");
  const [allowedScopeTypeIds, setAllowedScopeTypeIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const isManual = feedType === "manual";
  // Reference authoring only exists under the manual feed (the only branch that
  // exposes the value-type selector). Gating on isManual prevents a stale
  // valueType='reference' from writing dangling reference-config onto a
  // non-manual item when the admin switches the feed after choosing reference.
  const isReference = isManual && valueType === "reference";
  const keyValid = key === "" || /^[a-z0-9_]+$/.test(key);

  // The single value-holding scope for the selected category (system scope
  // types carry exactly one). Present once the category exists — the reference
  // picker needs it to resolve the org for the "scope" sub-picker.
  const scopeId =
    categories.find((c) => c.scope_type_id === scopeTypeId)?.scope_id ?? null;
  const orgScopeTypes = useMemo(
    () =>
      categories.map((c) => ({
        id: c.scope_type_id,
        label_singular: c.label_singular,
      })),
    [categories],
  );

  function toggleReferenceType(t: string) {
    setAllowedReferenceTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  }
  function toggleAllowedScopeType(id: string) {
    setAllowedScopeTypeIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save() {
    if (!scopeTypeId) {
      toast.error("Pick a category.");
      return;
    }
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
    if (isReference && allowedReferenceTypes.length === 0) {
      toast.error("Select at least one reference type.");
      return;
    }

    const hasValue =
      isManual &&
      value != null &&
      !(typeof value === "string" && value.trim() === "");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/system-context", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create_item",
          scopeTypeId,
          key: key.trim().toLowerCase(),
          display_name: displayName.trim(),
          value_type: isManual ? valueType : "string",
          sensitivity,
          description: description.trim(),
          // Reference and custom-component authoring are mutually exclusive.
          custom_component:
            isManual && !isReference ? (customComponent ?? null) : null,
          feed_type: feedType,
          feed_config: isManual ? {} : feedConfig,
          allowed_reference_types: isReference ? allowedReferenceTypes : null,
          max_items: isReference ? Math.max(1, Number(maxItems) || 1) : 1,
          allowed_scope_type_ids:
            isReference && allowedReferenceTypes.includes("scope")
              ? allowedScopeTypeIds
              : null,
          valueColumns: hasValue
            ? buildScopeValuePayload(value, valueType)
            : undefined,
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
      return;
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add System context resource</DialogTitle>
          <DialogDescription>
            A reusable, platform-wide resource. Define what it is, then choose
            how it stays populated — link a dataset, run an agent, hit an API,
            scrape the web, or (rarely) set a value by hand.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <Field label="Category">
            <Select value={scopeTypeId} onValueChange={setScopeTypeId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.scope_type_id} value={c.scope_type_id}>
                    {c.label_singular}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Key"
              hint={keyValid ? "lowercase_with_underscores" : undefined}
              error={
                !keyValid ? "lowercase letters, numbers, _ only" : undefined
              }
            >
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="company_name"
                className="font-mono text-sm"
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

          <Field label="Sensitivity">
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
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What this resource represents and where it's used."
            />
          </Field>

          {/* The feed — how this resource is populated. */}
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <FeedConfigEditor
              feedType={feedType}
              onFeedTypeChange={setFeedType}
              feedConfig={feedConfig}
              onFeedConfigChange={setFeedConfig}
            />
          </div>

          {/* Manual feeds author a value with a real input component. */}
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

              {isReference ? (
                <>
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">
                      Reference configuration
                    </div>
                    <ReferenceConfigFields
                      allowedReferenceTypes={allowedReferenceTypes}
                      onToggleReferenceType={toggleReferenceType}
                      maxItems={maxItems}
                      onMaxItemsChange={setMaxItems}
                      allowedScopeTypeIds={allowedScopeTypeIds}
                      onToggleAllowedScopeType={toggleAllowedScopeType}
                      orgScopeTypes={orgScopeTypes}
                      typeOptions={SYSTEM_CONTEXT_REFERENCE_TYPES}
                    />
                  </div>

                  <Field
                    label="Initial value"
                    hint="Optional — you can attach the entity now or later via Edit."
                  >
                    {scopeId ? (
                      <ContextValueInput
                        valueType="reference"
                        referenceConfig={{
                          allowed_reference_types: allowedReferenceTypes,
                          max_items: Math.max(1, Number(maxItems) || 1),
                          allowed_scope_type_ids: allowedScopeTypeIds.length
                            ? allowedScopeTypeIds
                            : null,
                        }}
                        scopeId={scopeId}
                        displayName={displayName || key || "value"}
                        value={value}
                        onChange={setValue}
                        minHeight={56}
                        maxHeight={400}
                      />
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        Create the item first, then attach an entity from its
                        Edit dialog.
                      </p>
                    )}
                  </Field>
                </>
              ) : (
                <>
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <div className="mb-2 text-xs font-medium text-muted-foreground">
                      Input component (how the value is authored)
                    </div>
                    <CustomComponentConfigurator
                      value={customComponent}
                      onChange={setCustomComponent}
                    />
                  </div>

                  <Field
                    label="Initial value"
                    hint="Optional — you can set it later."
                  >
                    <ContextValueInput
                      valueType={valueType}
                      customComponent={customComponent}
                      displayName={displayName || key || "value"}
                      value={value}
                      onChange={setValue}
                      minHeight={56}
                      maxHeight={400}
                    />
                  </Field>
                </>
              )}
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
          <Button type="button" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Create item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
