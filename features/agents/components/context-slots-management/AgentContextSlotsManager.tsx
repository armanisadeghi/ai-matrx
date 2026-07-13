"use client";

/**
 * AgentContextSlotsManager
 *
 * Smart component — manages context slots for the active agent.
 * UI matches Variables row: compact chips (key only) + Dialog/Drawer editor.
 *
 * Persists the full `ContextSlot` shape per the server contract
 * (see `api/context_objects_FE_GUIDE.md`):
 *   key, type, label, description, max_inline_chars, summary_agent_id,
 *   mutable, persist, source.
 */

import { useState, useCallback, useMemo } from "react";
import { Plus, X, ChevronDown, Layers } from "lucide-react";
import { useOpenScopeBatchImportWindow } from "@/features/overlays/openers/scopeBatchImportWindow";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ScrollFade } from "@/components/ui/scroll-fade";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextItemPicker } from "@/features/scope-system/components/ContextItemPicker";
import { contextItemValueTypeToSlotType } from "@/features/agents/utils/context-item-slot-mapping";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectAgentContextSlots } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentContextSlots } from "@/features/agents/redux/agent-definition/slice";
import type {
  ContextObjectType,
  ContextSlot,
  ContextSlotPersist,
  ContextSlotSource,
} from "@/features/agents/types/agent-api-types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { sanitizeVariableName } from "@/features/agents/utils/variable-utils";
import { AgentListDropdown } from "@/features/agents/components/agent-listings/AgentListDropdown";
import {
  InlinePolicyControl,
  decodeInlinePolicy,
  encodeInlinePolicy,
  type InlineMode,
} from "@/features/agents/components/context-slots-management/InlinePolicyControl";
import { AgentEditAccessControl } from "@/features/agents/components/context-slots-management/AgentEditAccessControl";
import { SCOPE_ITEM_NO_WRITEBACK_REASON } from "@/features/agents/utils/agent-edit-access";
import { cn } from "@/lib/utils";

const CONTEXT_TYPES: ContextObjectType[] = [
  "text",
  "json",
  "file_url",
  "db_ref",
  "user",
  "org",
  "workspace",
  "project",
  "task",
  "variable",
];

// Suggested default `max_inline_chars` per type, per the FE guide.
const SUGGESTED_INLINE_MODE_BY_TYPE: Record<
  ContextObjectType,
  "default" | "never"
> = {
  text: "default",
  json: "default",
  file_url: "default",
  db_ref: "never",
  user: "default",
  org: "default",
  workspace: "default",
  project: "default",
  task: "default",
  variable: "default",
};

// ─────────────────────────────────────────────────────────────────────────────
// Form state
// ─────────────────────────────────────────────────────────────────────────────

interface SlotFormState {
  key: string;
  label: string;
  description: string;
  type: ContextObjectType;
  // Inline policy — encoded as three explicit modes.
  inlineMode: InlineMode;
  inlineCustomChars: string; // string for the input; parsed on save
  // Summary sub-agent
  summaryAgentId: string;
  // Mutation
  mutable: boolean;
  persist: ContextSlotPersist;
  // Source (only meaningful when persist="auto")
  sourceKind: string;
  sourceId: string;
  sourceField: string;
  sourceExtra: string; // JSON string in the textarea
  // Scope-context binding (source.kind="ctx_item") — fills the slot from the active scope.
  // Independent of mutable/persist (read-fill always; writeback only if mutable+auto).
  ctxBound: boolean;
  ctxItemId: string;
  ctxScopeTypeId: string;
  ctxItemKey: string;
  ctxOnMissing: string;
}

const EMPTY_FORM: SlotFormState = {
  key: "",
  label: "",
  description: "",
  type: "text",
  inlineMode: "default",
  inlineCustomChars: "",
  summaryAgentId: "",
  mutable: false,
  persist: "never",
  sourceKind: "",
  sourceId: "",
  sourceField: "",
  sourceExtra: "",
  ctxBound: false,
  ctxItemId: "",
  ctxScopeTypeId: "",
  ctxItemKey: "",
  ctxOnMissing: "empty",
};

/**
 * Legacy stored slots (pre-`key` rename) carried an `id` field instead.
 * `ContextSlot` no longer declares it; read it defensively without widening
 * the type.
 */
function legacySlotId(slot: ContextSlot): string | undefined {
  return "id" in slot && typeof slot.id === "string" ? slot.id : undefined;
}

function getSlotKey(slot: ContextSlot): string {
  if (slot.key) return slot.key;
  return legacySlotId(slot) ?? "";
}

function slotToForm(slot: ContextSlot): SlotFormState {
  const legacyId = legacySlotId(slot);

  // Decode max_inline_chars into the three-mode UI (shared canonical helper).
  const { mode: inlineMode, customChars: inlineCustomChars } =
    decodeInlinePolicy(slot.max_inline_chars);

  const source = slot.source;
  const isCtx = source?.kind === "ctx_item";

  return {
    key: slot.key || legacyId || "",
    label: slot.label ?? "",
    description: slot.description ?? "",
    type: slot.type ?? "text",
    inlineMode,
    inlineCustomChars,
    summaryAgentId: slot.summary_agent_id ?? "",
    mutable: slot.mutable ?? false,
    persist: slot.persist ?? "never",
    // Manual source inputs are only for non-ctx_item kinds.
    sourceKind: isCtx ? "" : (source?.kind ?? ""),
    sourceId: isCtx ? "" : (source?.id ?? ""),
    sourceField: source?.field ?? "",
    sourceExtra:
      source?.extra && Object.keys(source.extra).length > 0
        ? JSON.stringify(source.extra, null, 2)
        : "",
    ctxBound: isCtx,
    ctxItemId: isCtx ? (source?.id ?? "") : "",
    ctxScopeTypeId: isCtx ? (source?.scope_type_id ?? "") : "",
    ctxItemKey: isCtx ? (source?.item_key ?? "") : "",
    ctxOnMissing: isCtx ? (source?.on_missing ?? "empty") : "empty",
  };
}

/**
 * The save mode a slot can actually honour. A scope-bound slot has no writeback
 * handler on the server, so "auto" would silently discard the agent's edits —
 * it reads (and saves) as conversation-only instead.
 */
function effectivePersist(form: SlotFormState): ContextSlotPersist {
  if (form.ctxBound && form.persist === "auto") return "never";
  return form.persist;
}

function formToContextSlot(form: SlotFormState): {
  slot: ContextSlot | null;
  error: string | null;
} {
  const key = form.key.trim() ? sanitizeVariableName(form.key) : "";
  if (!key) return { slot: null, error: "Key is required." };

  const slot: ContextSlot = { key, type: form.type };

  if (form.label.trim()) slot.label = form.label.trim();
  if (form.description.trim()) slot.description = form.description.trim();

  // max_inline_chars (shared canonical encode; default → omit so server uses 200).
  const encodedInline = encodeInlinePolicy({
    mode: form.inlineMode,
    customChars: form.inlineCustomChars,
  });
  if ("error" in encodedInline)
    return { slot: null, error: encodedInline.error };
  if (encodedInline.maxInlineChars !== null) {
    slot.max_inline_chars = encodedInline.maxInlineChars;
  }

  if (form.summaryAgentId.trim()) {
    slot.summary_agent_id = form.summaryAgentId.trim();
  }

  if (form.mutable) {
    slot.mutable = true;
    slot.persist = effectivePersist(form);
  }

  // Scope-context binding (independent of agent access): fills the slot from the active
  // scope, and — when also agent-editable + save-to-source — is the same source used for
  // write-back.
  if (form.ctxBound) {
    if (!form.ctxItemId.trim()) {
      return {
        slot: null,
        error: "Choose a context item to bind this slot to.",
      };
    }
    slot.source = {
      kind: "ctx_item",
      id: form.ctxItemId.trim(),
      scope_type_id: form.ctxScopeTypeId.trim() || undefined,
      item_key: form.ctxItemKey.trim() || undefined,
      on_missing: form.ctxOnMissing.trim() || "empty",
    };
  } else if (form.mutable && form.persist === "auto") {
    if (!form.sourceKind.trim()) {
      return {
        slot: null,
        error:
          "Source 'kind' is required when the agent's edits save to the source.",
      };
    }
    const source: ContextSlotSource = { kind: form.sourceKind.trim() };
    if (form.sourceId.trim()) source.id = form.sourceId.trim();
    if (form.sourceField.trim()) source.field = form.sourceField.trim();
    if (form.sourceExtra.trim()) {
      try {
        const parsed = JSON.parse(form.sourceExtra);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          source.extra = parsed as Record<string, unknown>;
        } else {
          return { slot: null, error: "Source extra must be a JSON object." };
        }
      } catch {
        return { slot: null, error: "Source extra is not valid JSON." };
      }
    }
    slot.source = source;
  }

  return { slot, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor — UI
// ─────────────────────────────────────────────────────────────────────────────

interface SlotEditorFieldsProps {
  form: SlotFormState;
  onChange: (patch: Partial<SlotFormState>) => void;
  isEdit: boolean;
  keyDuplicate: boolean;
  keyRulesOk: boolean;
  formError: string | null;
}

function SlotEditorFields({
  form,
  onChange,
  isEdit,
  keyDuplicate,
  keyRulesOk,
  formError,
}: SlotEditorFieldsProps) {
  const sourceDisabled = !form.mutable || form.persist !== "auto";

  return (
    <div className="space-y-5 py-1">
      {/* ──────────────────── Scope binding ──────────────────── */}
      <Section
        title="Scope binding"
        subtitle="Bind to a context item to fill this slot's key, label, description, and type from it automatically — you can still edit any of them below. Leave unbound to configure a fully custom slot."
      >
        <Field>
          <label className="flex items-center gap-2 cursor-pointer">
            <Checkbox
              checked={form.ctxBound}
              onCheckedChange={(c) => onChange({ ctxBound: c === true })}
            />
            <span className="text-xs">Bind to a context item</span>
          </label>
        </Field>
        {form.ctxBound && (
          <Field className="pl-6 pt-1 space-y-2">
            <ContextItemPicker
              value={{
                scopeTypeId: form.ctxScopeTypeId,
                contextItemId: form.ctxItemId,
              }}
              onChange={(sel) => {
                const patch: Partial<SlotFormState> = {
                  ctxItemId: sel.contextItemId,
                  ctxScopeTypeId: sel.scopeTypeId,
                  ctxItemKey: sel.itemKey,
                };
                if (sel.item) {
                  // Pick auto-fills identity from the item; the key stays
                  // locked once a slot exists (its key can't be renamed).
                  if (!isEdit) {
                    const suggestedKey = sanitizeVariableName(
                      sel.item.key || sel.item.display_name,
                    );
                    if (suggestedKey) patch.key = suggestedKey;
                  }
                  patch.label = sel.item.display_name;
                  patch.description = sel.item.description ?? "";
                  const nextType = contextItemValueTypeToSlotType(
                    sel.item.value_type,
                  );
                  patch.type = nextType;
                  patch.inlineMode = SUGGESTED_INLINE_MODE_BY_TYPE[nextType];
                  patch.inlineCustomChars = "";
                }
                onChange(patch);
              }}
            />
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                When no scope provides it
              </Label>
              <Select
                value={form.ctxOnMissing}
                onValueChange={(v) => onChange({ ctxOnMissing: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="empty">
                    Empty — leave the slot unfilled
                  </SelectItem>
                  <SelectItem value="skip">Skip — same as empty</SelectItem>
                  <SelectItem value="error">
                    Error — refuse to run if missing
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </Field>
        )}
      </Section>

      {/* ──────────────────── Identity ──────────────────── */}
      <Section
        title="Identity"
        subtitle={
          form.ctxBound
            ? "Pre-filled from the bound context item — edit freely."
            : undefined
        }
      >
        <Field>
          <Label htmlFor="slot-key" className="text-xs">
            Context key
          </Label>
          <Input
            id="slot-key"
            value={form.key}
            onChange={(e) => onChange({ key: e.target.value })}
            placeholder="clipboard_content"
            disabled={isEdit}
            style={{ fontSize: "16px" }}
          />
          {keyDuplicate && (
            <p className="text-xs text-destructive">This key already exists.</p>
          )}
          {form.key.trim() && !keyRulesOk && (
            <p className="text-xs text-muted-foreground">
              Use letters, numbers, and underscores only. Start with a letter.
            </p>
          )}
        </Field>

        <Field>
          <Label htmlFor="slot-type" className="text-xs">
            Type
          </Label>
          <Select
            value={form.type}
            onValueChange={(v) => {
              const nextType = v as ContextObjectType;
              // Suggest a sensible default inline policy when the type changes.
              const suggested = SUGGESTED_INLINE_MODE_BY_TYPE[nextType];
              onChange({
                type: nextType,
                inlineMode: suggested,
                inlineCustomChars: "",
              });
            }}
          >
            <SelectTrigger id="slot-type" className="text-sm w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTEXT_TYPES.map((t) => (
                <SelectItem key={t} value={t} className="text-xs font-mono">
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field>
          <Label htmlFor="slot-label" className="text-xs">
            Label{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="slot-label"
            value={form.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Clipboard content"
            style={{ fontSize: "16px" }}
          />
        </Field>

        <Field>
          <Label htmlFor="slot-desc" className="text-xs">
            Description{" "}
            <span className="text-muted-foreground font-normal">
              (shown to the model — be specific)
            </span>
          </Label>
          <Textarea
            id="slot-desc"
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="What this slot provides at runtime. The model uses this to decide whether to fetch via ctx_get…"
            className="min-h-[72px] resize-y"
            style={{ fontSize: "16px" }}
          />
        </Field>
      </Section>

      {/* ──────────────────── Inline policy ──────────────────── */}
      <Section
        title="Inline policy"
        subtitle="Controls when content is rendered inline in the manifest vs deferred behind ctx_get. The agent value is a ceiling — surfaces can lower but never raise it."
      >
        <InlinePolicyControl
          value={{ mode: form.inlineMode, customChars: form.inlineCustomChars }}
          onChange={(v) =>
            onChange({ inlineMode: v.mode, inlineCustomChars: v.customChars })
          }
        />
      </Section>

      {/* ──────────────────── Summary sub-agent ──────────────────── */}
      <Section
        title="Summary sub-agent"
        subtitle="When set, the model can call ctx_get(mode='summary') and the slot content is routed through this agent. Optional."
      >
        <Field>
          <div className="flex items-stretch gap-2">
            <Input
              value={form.summaryAgentId}
              onChange={(e) => onChange({ summaryAgentId: e.target.value })}
              placeholder="Paste an agent ID, or pick →"
              className="font-mono text-xs flex-1"
              style={{ fontSize: "16px" }}
            />
            <AgentListDropdown
              onSelect={(agentId) => onChange({ summaryAgentId: agentId })}
              triggerSlot={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 gap-1"
                >
                  Pick agent <ChevronDown className="w-3 h-3" />
                </Button>
              }
            />
            {form.summaryAgentId.trim() && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-9 shrink-0"
                onClick={() => onChange({ summaryAgentId: "" })}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        </Field>
      </Section>

      {/* ──────────────────── Agent access ──────────────────── */}
      <Section
        title="Agent access"
        subtitle="Whether the agent may change this value, or only read it."
      >
        <AgentEditAccessControl
          value={{
            access: form.mutable ? "editable" : "read_only",
            // A legacy scope-bound slot can carry persist="auto" — writeback the
            // server never performs. Show (and, on save, store) the truth.
            saveMode: effectivePersist(form),
          }}
          onChange={(next) =>
            onChange({
              mutable: next.access === "editable",
              persist: next.saveMode,
            })
          }
          saveToSourceDisabledReason={
            form.ctxBound ? SCOPE_ITEM_NO_WRITEBACK_REASON : undefined
          }
        />
      </Section>

      {/* ──────────────────── Source (save-to-source only) ──────────────────── */}
      {form.mutable && form.persist === "auto" && !form.ctxBound && (
        <Section
          title="Source record"
          subtitle="Where the agent's edits are written back. Required when edits save to the source."
        >
          <Field>
            <Label htmlFor="src-kind" className="text-xs">
              Kind <span className="text-destructive">*</span>
            </Label>
            <Input
              id="src-kind"
              value={form.sourceKind}
              onChange={(e) => onChange({ sourceKind: e.target.value })}
              placeholder="note  |  doc  |  table_row"
              disabled={sourceDisabled}
              className="font-mono text-xs"
              style={{ fontSize: "16px" }}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <Label htmlFor="src-id" className="text-xs">
                ID
              </Label>
              <Input
                id="src-id"
                value={form.sourceId}
                onChange={(e) => onChange({ sourceId: e.target.value })}
                placeholder="(optional)"
                disabled={sourceDisabled}
                className="font-mono text-xs"
                style={{ fontSize: "16px" }}
              />
            </Field>
            <Field>
              <Label htmlFor="src-field" className="text-xs">
                Field
              </Label>
              <Input
                id="src-field"
                value={form.sourceField}
                onChange={(e) => onChange({ sourceField: e.target.value })}
                placeholder="(optional)"
                disabled={sourceDisabled}
                className="font-mono text-xs"
                style={{ fontSize: "16px" }}
              />
            </Field>
          </div>
          <Field>
            <Label htmlFor="src-extra" className="text-xs">
              Extra{" "}
              <span className="text-muted-foreground font-normal">
                (JSON object, optional)
              </span>
            </Label>
            <Textarea
              id="src-extra"
              value={form.sourceExtra}
              onChange={(e) => onChange({ sourceExtra: e.target.value })}
              placeholder='{ "scope": "user" }'
              disabled={sourceDisabled}
              className="min-h-[72px] resize-y font-mono text-xs"
              style={{ fontSize: "16px" }}
            />
          </Field>
        </Section>
      )}

      {formError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {formError}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Small primitives
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("space-y-1.5", className)}>{children}</div>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface AgentContextSlotsManagerProps {
  agentId: string;
}

export function AgentContextSlotsManager({
  agentId,
}: AgentContextSlotsManagerProps) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const openBatchImport = useOpenScopeBatchImportWindow();
  const slotsRaw = useAppSelector((state) =>
    selectAgentContextSlots(state, agentId),
  );
  const slots = useMemo(() => slotsRaw ?? [], [slotsRaw]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [form, setForm] = useState<SlotFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const patchForm = useCallback((patch: Partial<SlotFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setFormError(null);
  }, []);

  const sanitizedKey = form.key.trim() ? sanitizeVariableName(form.key) : "";
  const keyValid =
    /^[a-z_][a-z0-9_]*$/.test(sanitizedKey) && sanitizedKey.length > 0;

  const existingKeys = slots
    .map((s, i) => (i !== editIndex ? getSlotKey(s) : ""))
    .filter(Boolean);

  const keyDuplicate =
    editIndex === null &&
    sanitizedKey.length > 0 &&
    existingKeys
      .map((k) => k.toLowerCase())
      .includes(sanitizedKey.toLowerCase());

  const canSave = keyValid && !keyDuplicate;

  const openAdd = () => {
    setEditIndex(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditorOpen(true);
  };

  const openEdit = (idx: number) => {
    const slot = slots[idx];
    if (!slot) return;
    setForm(slotToForm(slot));
    setEditIndex(idx);
    setFormError(null);
    setEditorOpen(true);
  };

  const handleSave = () => {
    if (!canSave) return;
    const { slot: newSlot, error } = formToContextSlot(form);
    if (!newSlot) {
      setFormError(error);
      return;
    }
    const next: ContextSlot[] =
      editIndex === null
        ? [...slots, newSlot]
        : slots.map((s, i) => (i === editIndex ? newSlot : s));

    dispatch(
      setAgentContextSlots({
        id: agentId,
        contextSlots: next,
      }),
    );
    setEditorOpen(false);
  };

  const handleDelete = (idx: number) => {
    dispatch(
      setAgentContextSlots({
        id: agentId,
        contextSlots: slots.filter((_, i) => i !== idx),
      }),
    );
  };

  const title = editIndex === null ? "Add context slot" : "Edit context slot";
  const description =
    editIndex === null
      ? "Define a context key clients can pass in the request `context` object. Keys listed here get typed handling, labels, inline behaviour, and optional mutation."
      : "Update this slot's metadata, inline policy, summary agent, or whether the agent can edit it.";

  const editorBody = (
    <>
      <SlotEditorFields
        form={form}
        onChange={patchForm}
        isEdit={editIndex !== null}
        keyDuplicate={keyDuplicate}
        keyRulesOk={keyValid}
        formError={formError}
      />
      <div className="sticky bottom-0 flex justify-end gap-2 pt-3 pb-1 bg-background/95 backdrop-blur-sm">
        <Button variant="outline" onClick={() => setEditorOpen(false)}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={!canSave}>
          {editIndex === null ? "Add slot" : "Save changes"}
        </Button>
      </div>
    </>
  );

  return (
    <>
      <div className="flex items-center gap-2 min-w-0">
        <Label className="text-xs text-muted-foreground shrink-0">
          Context
        </Label>

        <ScrollFade
          orientation="horizontal"
          className="flex items-center gap-1.5 flex-nowrap min-w-0 flex-1 py-0.5"
        >
          {slots.map((slot, i) => {
            const key = getSlotKey(slot);
            const detail = slot.label?.trim()
              ? slot.label
              : slot.description?.trim()
                ? slot.description
                : "";
            return (
              <div
                key={`${key}-${i}`}
                className="inline-flex items-center gap-1.5 px-2.5 rounded-md text-xs font-medium bg-muted text-foreground border border-border group shrink-0"
              >
                <span
                  className="cursor-pointer transition-colors hover:text-primary truncate max-w-[160px]"
                  onClick={() => openEdit(i)}
                  title={
                    detail ? `${key} — ${detail}` : `${key} (click to edit)`
                  }
                >
                  {key}
                </span>
                <button
                  type="button"
                  onClick={() => handleDelete(i)}
                  title="Remove context slot"
                  className="hover:text-destructive transition-colors shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </ScrollFade>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            onClick={openAdd}
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </button>

          <button
            type="button"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
            onClick={() => openBatchImport({ agentId })}
            title="Batch add variables and context slots from a scope type"
          >
            <Layers className="w-3.5 h-3.5" />
            Batch add
          </button>
        </div>
      </div>

      {isMobile ? (
        <Drawer
          open={editorOpen}
          onOpenChange={(o) => !o && setEditorOpen(false)}
        >
          <DrawerContent className="px-4 pb-safe max-h-[92dvh]">
            <DrawerHeader className="px-0">
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </DrawerHeader>
            <ScrollArea className="flex-1 overflow-y-auto pb-4">
              {editorBody}
            </ScrollArea>
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog
          open={editorOpen}
          onOpenChange={(o) => !o && setEditorOpen(false)}
        >
          <DialogContent className="sm:max-w-[620px] max-h-[92dvh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-1 overflow-y-auto pr-2">
              <div className="py-1">{editorBody}</div>
            </ScrollArea>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
