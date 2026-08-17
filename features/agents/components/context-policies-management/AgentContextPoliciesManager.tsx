"use client";

/**
 * AgentContextPoliciesManager
 *
 * Smart component — manages context policies for the active agent.
 * UI matches Variables row: compact chips (key only) + Dialog/Drawer editor.
 *
 * Persists the full `ContextPolicy` shape per the server contract
 * (see `api/context_objects_FE_GUIDE.md`):
 *   key, type, label, description, max_inline_chars, summary_agent_id,
 *   mutable, persist, source.
 */

import { useState, useCallback, useMemo } from "react";
import { Plus, X, ChevronDown, Layers, Search, Link2, Pencil } from "lucide-react";
import { useOpenScopeBatchImportWindow } from "@/features/overlays/openers/scopeBatchImportWindow";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { ContextItemPicker } from "@/features/scope-system/components/ContextItemPicker";
import { contextItemValueTypeToPolicyType } from "@/features/agents/utils/context-item-policy-mapping";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppSelector, useAppDispatch } from "@/lib/redux/hooks";
import { selectAgentContextPolicies } from "@/features/agents/redux/agent-definition/selectors";
import { setAgentContextPolicies } from "@/features/agents/redux/agent-definition/slice";
import type {
  ContextObjectType,
  ContextPolicy,
  ContextPolicyPersist,
  ContextPolicySource,
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
} from "@/features/agents/components/context-policies-management/InlinePolicyControl";
import { AgentEditAccessControl } from "@/features/agents/components/context-policies-management/AgentEditAccessControl";
import { SCOPE_ITEM_DEFAULT_SAVE_MODE } from "@/features/agents/utils/agent-edit-access";
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

interface PolicyFormState {
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
  persist: ContextPolicyPersist;
  // Source (only meaningful when persist="auto")
  sourceKind: string;
  sourceId: string;
  sourceField: string;
  sourceExtra: string; // JSON string in the textarea
  // Scope-context binding (source.kind="ctx_item") — fills the policy from the active scope.
  // Independent of mutable/persist (read-fill always; writeback only if mutable+auto).
  ctxBound: boolean;
  ctxItemId: string;
  ctxScopeTypeId: string;
  ctxItemKey: string;
  ctxOnMissing: string;
}

const EMPTY_FORM: PolicyFormState = {
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
 * Legacy stored policies (pre-`key` rename) carried an `id` field instead.
 * `ContextPolicy` no longer declares it; read it defensively without widening
 * the type.
 */
function legacyPolicyId(policy: ContextPolicy): string | undefined {
  return "id" in policy && typeof policy.id === "string" ? policy.id : undefined;
}

function getPolicyKey(policy: ContextPolicy): string {
  if (policy.key) return policy.key;
  return legacyPolicyId(policy) ?? "";
}

function policyToForm(policy: ContextPolicy): PolicyFormState {
  const legacyId = legacyPolicyId(policy);

  // Decode max_inline_chars into the three-mode UI (shared canonical helper).
  const { mode: inlineMode, customChars: inlineCustomChars } =
    decodeInlinePolicy(policy.max_inline_chars);

  const source = policy.source;
  const isCtx = source?.kind === "ctx_item";

  return {
    key: policy.key || legacyId || "",
    label: policy.label ?? "",
    description: policy.description ?? "",
    type: policy.type ?? "text",
    inlineMode,
    inlineCustomChars,
    summaryAgentId: policy.summary_agent_id ?? "",
    mutable: policy.mutable ?? false,
    persist: policy.persist ?? "never",
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

function formToContextPolicy(form: PolicyFormState): {
  policy: ContextPolicy | null;
  error: string | null;
} {
  const key = form.key.trim() ? sanitizeVariableName(form.key) : "";
  if (!key) return { policy: null, error: "Key is required." };

  const policy: ContextPolicy = { key, type: form.type };

  if (form.label.trim()) policy.label = form.label.trim();
  if (form.description.trim()) policy.description = form.description.trim();

  // max_inline_chars (shared canonical encode; default → omit so server uses 200).
  const encodedInline = encodeInlinePolicy({
    mode: form.inlineMode,
    customChars: form.inlineCustomChars,
  });
  if ("error" in encodedInline)
    return { policy: null, error: encodedInline.error };
  if (encodedInline.maxInlineChars !== null) {
    policy.max_inline_chars = encodedInline.maxInlineChars;
  }

  if (form.summaryAgentId.trim()) {
    policy.summary_agent_id = form.summaryAgentId.trim();
  }

  if (form.mutable) {
    policy.mutable = true;
    policy.persist = form.persist;
  }

  // Scope-context binding (independent of agent access): fills the policy from the active
  // scope, and — when also agent-editable + save-to-source — is the same source used for
  // write-back.
  if (form.ctxBound) {
    if (!form.ctxItemId.trim()) {
      return {
        policy: null,
        error: "Choose a context item to bind this policy to.",
      };
    }
    policy.source = {
      kind: "ctx_item",
      id: form.ctxItemId.trim(),
      scope_type_id: form.ctxScopeTypeId.trim() || undefined,
      item_key: form.ctxItemKey.trim() || undefined,
      on_missing: form.ctxOnMissing.trim() || "empty",
    };
  } else if (form.mutable && form.persist === "auto") {
    if (!form.sourceKind.trim()) {
      return {
        policy: null,
        error:
          "Source 'kind' is required when the agent's edits save to the source.",
      };
    }
    const source: ContextPolicySource = { kind: form.sourceKind.trim() };
    if (form.sourceId.trim()) source.id = form.sourceId.trim();
    if (form.sourceField.trim()) source.field = form.sourceField.trim();
    if (form.sourceExtra.trim()) {
      try {
        const parsed = JSON.parse(form.sourceExtra);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          source.extra = parsed as Record<string, unknown>;
        } else {
          return { policy: null, error: "Source extra must be a JSON object." };
        }
      } catch {
        return { policy: null, error: "Source extra is not valid JSON." };
      }
    }
    policy.source = source;
  }

  return { policy, error: null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Editor — UI
// ─────────────────────────────────────────────────────────────────────────────

interface PolicyEditorFieldsProps {
  form: PolicyFormState;
  onChange: (patch: Partial<PolicyFormState>) => void;
  isEdit: boolean;
  keyDuplicate: boolean;
  keyRulesOk: boolean;
  formError: string | null;
}

function PolicyEditorFields({
  form,
  onChange,
  isEdit,
  keyDuplicate,
  keyRulesOk,
  formError,
}: PolicyEditorFieldsProps) {
  const sourceDisabled = !form.mutable || form.persist !== "auto";

  return (
    <div className="space-y-5 py-1">
      {/* ──────────────────── Scope binding ──────────────────── */}
      <Section
        title="Scope binding"
        subtitle="Bind to a context item to fill this policy's key, label, description, and type from it automatically — you can still edit any of them below. Leave unbound to configure a fully custom policy."
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
                const patch: Partial<PolicyFormState> = {
                  ctxItemId: sel.contextItemId,
                  ctxScopeTypeId: sel.scopeTypeId,
                  ctxItemKey: sel.itemKey,
                };
                if (sel.item) {
                  // Pick auto-fills identity from the item; the key stays
                  // locked once a policy exists (its key can't be renamed).
                  if (!isEdit) {
                    const suggestedKey = sanitizeVariableName(
                      sel.item.key || sel.item.display_name,
                    );
                    if (suggestedKey) patch.key = suggestedKey;
                  }
                  patch.label = sel.item.display_name;
                  patch.description = sel.item.description ?? "";
                  const nextType = contextItemValueTypeToPolicyType(
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
                    Empty — leave the policy unfilled
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
          <Label htmlFor="policy-key" className="text-xs">
            Context key
          </Label>
          <Input
            id="policy-key"
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
          <Label htmlFor="policy-type" className="text-xs">
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
            <SelectTrigger id="policy-type" className="text-sm w-full">
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
          <Label htmlFor="policy-label" className="text-xs">
            Label{" "}
            <span className="text-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Input
            id="policy-label"
            value={form.label}
            onChange={(e) => onChange({ label: e.target.value })}
            placeholder="Clipboard content"
            style={{ fontSize: "16px" }}
          />
        </Field>

        <Field>
          <Label htmlFor="policy-desc" className="text-xs">
            Description{" "}
            <span className="text-muted-foreground font-normal">
              (shown to the model — be specific)
            </span>
          </Label>
          <Textarea
            id="policy-desc"
            value={form.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder="What this policy provides at runtime. The model uses this to decide whether to fetch via ctx_get…"
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
        subtitle="When set, the model can call ctx_get(mode='summary') and the policy content is routed through this agent. Optional."
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
            saveMode: form.persist,
          }}
          onChange={(next) => {
            // Turning ON edit for a scope-bound policy defaults to writing back to the
            // scope cell — that's what "the agent can edit this" means for a scope
            // value. An unbound policy has no source yet, so it stays conversation-only
            // until the author names one.
            const enabling = next.access === "editable" && !form.mutable;
            const saveMode =
              enabling && form.ctxBound && next.saveMode === "never"
                ? SCOPE_ITEM_DEFAULT_SAVE_MODE
                : next.saveMode;
            onChange({
              mutable: next.access === "editable",
              persist: saveMode,
            });
          }}
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
// Context policy stack — a single "N context policies" chip that opens a popover
// with the full, scrollable, searchable list. Agents can carry dozens of
// policies (batch-import makes that the common case, not the exception), so the
// row this lives in must stay one line regardless of count. This is purely a
// design-time view of the agent's defined policies — it never reads a resolved
// runtime value or active scope, so it renders identically whether or not
// the agent has ever been run.
// ─────────────────────────────────────────────────────────────────────────────

const SEARCH_THRESHOLD = 6;

function ContextPolicyStackTrigger({
  policies,
  onEdit,
  onDelete,
}: {
  policies: ContextPolicy[];
  onEdit: (idx: number) => void;
  onDelete: (idx: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const indexed = policies.map((policy, i) => ({ policy, i }));
    const q = search.trim().toLowerCase();
    if (!q) return indexed;
    return indexed.filter(({ policy }) => {
      const key = getPolicyKey(policy).toLowerCase();
      const label = (policy.label ?? "").toLowerCase();
      const description = (policy.description ?? "").toLowerCase();
      return (
        key.includes(q) || label.includes(q) || description.includes(q)
      );
    });
  }, [policies, search]);

  if (policies.length === 0) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-foreground border border-border hover:bg-accent transition-colors shrink-0"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>
            {policies.length} context policy{policies.length === 1 ? "" : "s"}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        {policies.length > SEARCH_THRESHOLD && (
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-border/50">
            <Search className="w-3 h-3 text-muted-foreground shrink-0" />
            <input
              autoFocus
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter context policies…"
              className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
              style={{ fontSize: "16px" }}
            />
          </div>
        )}
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-4">
              No matches
            </p>
          ) : (
            filtered.map(({ policy, i }) => {
              const key = getPolicyKey(policy);
              const detail = policy.label?.trim()
                ? policy.label
                : policy.description?.trim()
                  ? policy.description
                  : "";
              const isBound = policy.source?.kind === "ctx_item";
              return (
                <div
                  key={`${key}-${i}`}
                  className="group flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-accent/50 transition-colors"
                >
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left"
                    onClick={() => {
                      setOpen(false);
                      onEdit(i);
                    }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-mono font-medium truncate">
                        {key}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[9px] px-1 py-0 font-normal shrink-0"
                      >
                        {policy.type}
                      </Badge>
                      {isBound && (
                        <Link2
                          className="w-3 h-3 text-primary/70 shrink-0"
                          aria-label="Bound to a scope context item"
                        />
                      )}
                      {policy.mutable && (
                        <Pencil
                          className="w-3 h-3 text-amber-600 dark:text-amber-400 shrink-0"
                          aria-label="Mutable"
                        />
                      )}
                    </div>
                    {detail && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {detail}
                      </p>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(i)}
                    title="Remove context policy"
                    className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface AgentContextPoliciesManagerProps {
  agentId: string;
}

export function AgentContextPoliciesManager({
  agentId,
}: AgentContextPoliciesManagerProps) {
  const dispatch = useAppDispatch();
  const isMobile = useIsMobile();
  const openBatchImport = useOpenScopeBatchImportWindow();
  const policiesRaw = useAppSelector((state) =>
    selectAgentContextPolicies(state, agentId),
  );
  const policies = useMemo(() => policiesRaw ?? [], [policiesRaw]);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [form, setForm] = useState<PolicyFormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const patchForm = useCallback((patch: Partial<PolicyFormState>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setFormError(null);
  }, []);

  const sanitizedKey = form.key.trim() ? sanitizeVariableName(form.key) : "";
  const keyValid =
    /^[a-z_][a-z0-9_]*$/.test(sanitizedKey) && sanitizedKey.length > 0;

  const existingKeys = policies
    .map((s, i) => (i !== editIndex ? getPolicyKey(s) : ""))
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
    const policy = policies[idx];
    if (!policy) return;
    setForm(policyToForm(policy));
    setEditIndex(idx);
    setFormError(null);
    setEditorOpen(true);
  };

  const handleSave = () => {
    if (!canSave) return;
    const { policy: newPolicy, error } = formToContextPolicy(form);
    if (!newPolicy) {
      setFormError(error);
      return;
    }
    const next: ContextPolicy[] =
      editIndex === null
        ? [...policies, newPolicy]
        : policies.map((s, i) => (i === editIndex ? newPolicy : s));

    dispatch(
      setAgentContextPolicies({
        id: agentId,
        contextPolicies: next,
      }),
    );
    setEditorOpen(false);
  };

  const handleDelete = (idx: number) => {
    dispatch(
      setAgentContextPolicies({
        id: agentId,
        contextPolicies: policies.filter((_, i) => i !== idx),
      }),
    );
  };

  const title = editIndex === null ? "Add context policy" : "Edit context policy";
  const description =
    editIndex === null
      ? "Define a context key clients can pass in the request `context` object. Keys listed here get typed handling, labels, inline behaviour, and optional mutation."
      : "Update this policy's metadata, inline policy, summary agent, or whether the agent can edit it.";

  const editorBody = (
    <>
      <PolicyEditorFields
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
          {editIndex === null ? "Add policy" : "Save changes"}
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

        <ContextPolicyStackTrigger
          policies={policies}
          onEdit={openEdit}
          onDelete={handleDelete}
        />

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
            title="Batch add variables and context policies from a scope type"
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
