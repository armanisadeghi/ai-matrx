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
import { Plus, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
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
};

function getSlotKey(slot: ContextSlot): string {
  if (slot.key) return slot.key;
  const legacy = slot as unknown as { id?: string };
  return legacy.id ?? "";
}

function slotToForm(slot: ContextSlot): SlotFormState {
  const legacy = slot as unknown as { id?: string };

  // Decode max_inline_chars into the three-mode UI (shared canonical helper).
  const { mode: inlineMode, customChars: inlineCustomChars } = decodeInlinePolicy(
    slot.max_inline_chars,
  );

  const source = slot.source;

  return {
    key: slot.key || legacy.id || "",
    label: slot.label ?? "",
    description: slot.description ?? "",
    type: slot.type ?? "text",
    inlineMode,
    inlineCustomChars,
    summaryAgentId: slot.summary_agent_id ?? "",
    mutable: slot.mutable ?? false,
    persist: slot.persist ?? "never",
    sourceKind: source?.kind ?? "",
    sourceId: source?.id ?? "",
    sourceField: source?.field ?? "",
    sourceExtra:
      source?.extra && Object.keys(source.extra).length > 0
        ? JSON.stringify(source.extra, null, 2)
        : "",
  };
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
  if ("error" in encodedInline) return { slot: null, error: encodedInline.error };
  if (encodedInline.maxInlineChars !== null) {
    slot.max_inline_chars = encodedInline.maxInlineChars;
  }

  if (form.summaryAgentId.trim()) {
    slot.summary_agent_id = form.summaryAgentId.trim();
  }

  if (form.mutable) {
    slot.mutable = true;
    slot.persist = form.persist;

    if (form.persist === "auto") {
      if (!form.sourceKind.trim()) {
        return {
          slot: null,
          error: "Source 'kind' is required when persistence is 'auto'.",
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
            return {
              slot: null,
              error: "Source extra must be a JSON object.",
            };
          }
        } catch {
          return { slot: null, error: "Source extra is not valid JSON." };
        }
      }
      slot.source = source;
    }
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
      {/* ──────────────────── Identity ──────────────────── */}
      <Section title="Identity">
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

      {/* ──────────────────── Mutation ──────────────────── */}
      <Section
        title="Mutation"
        subtitle="Allow the model to rewrite this slot via ctx_patch."
      >
        <label className="flex items-start gap-2 cursor-pointer">
          <Checkbox
            checked={form.mutable}
            onCheckedChange={(v) => onChange({ mutable: Boolean(v) })}
            className="mt-0.5"
          />
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Mutable</div>
            <p className="text-xs text-muted-foreground">
              Enables ctx_patch on this slot. Default is read-only.
            </p>
          </div>
        </label>

        {form.mutable && (
          <Field className="pl-6 pt-2">
            <Label className="text-xs">Persistence</Label>
            <PersistSegment
              value={form.persist}
              onChange={(p) => onChange({ persist: p })}
            />
          </Field>
        )}
      </Section>

      {/* ──────────────────── Source (auto-persist only) ──────────────────── */}
      {form.mutable && form.persist === "auto" && (
        <Section
          title="Source"
          subtitle="Tells the server-side writeback dispatcher where the row lives. Required when persistence is 'auto'."
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

function PersistSegment({
  value,
  onChange,
}: {
  value: ContextSlotPersist;
  onChange: (next: ContextSlotPersist) => void;
}) {
  const options: { id: ContextSlotPersist; label: string; hint: string }[] = [
    {
      id: "never",
      label: "In-memory",
      hint: "Never persisted — model can edit, but it's lost after the turn.",
    },
    {
      id: "auto",
      label: "Auto",
      hint: "Server writes back via the source dispatcher.",
    },
    {
      id: "client",
      label: "Client",
      hint: "Client owns persistence; server emits context_changed only.",
    },
  ];
  const active = options.find((o) => o.id === value) ?? options[0];

  return (
    <div className="space-y-1.5">
      <div
        role="radiogroup"
        className="inline-flex rounded-md border border-border bg-card/40 p-0.5"
      >
        {options.map((o) => (
          <button
            type="button"
            key={o.id}
            role="radio"
            aria-checked={o.id === value}
            onClick={() => onChange(o.id)}
            className={cn(
              "px-2.5 py-1 text-xs rounded transition-colors",
              o.id === value
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground/80">{active.hint}</p>
    </div>
  );
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
      : "Update this slot's metadata, inline policy, summary agent, or mutation behaviour.";

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
      <div className="flex items-center gap-2 flex-wrap">
        <Label className="text-xs text-muted-foreground">Context</Label>

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
              className="inline-flex items-center gap-1.5 px-2.5 rounded-md text-xs font-medium bg-muted text-foreground border border-border group"
            >
              <span
                className="cursor-pointer transition-colors hover:text-primary truncate max-w-[160px]"
                onClick={() => openEdit(i)}
                title={detail ? `${key} — ${detail}` : `${key} (click to edit)`}
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

        <button
          type="button"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted rounded-md transition-colors"
          onClick={openAdd}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
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
