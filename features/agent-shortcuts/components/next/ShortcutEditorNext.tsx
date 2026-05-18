"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

import { useAgentShortcutCrud } from "@/features/agent-shortcuts/hooks/useAgentShortcutCrud";
import { selectShortcutById } from "@/features/agents/redux/agent-shortcuts/selectors";
import { fetchFullShortcut } from "@/features/agents/redux/agent-shortcuts/thunks";
import {
  selectAllCategoriesArray,
} from "@/features/agents/redux/agent-shortcut-categories/selectors";
import { fetchCategoriesForScope } from "@/features/agents/redux/agent-shortcut-categories/thunks";

import { SurfacePicker } from "./SurfacePicker";
import { WidgetPicker } from "./WidgetPicker";
import { CategoryPicker } from "./CategoryPicker";
import { CompactVersionPicker } from "./CompactVersionPicker";
import { SettingsSection, type SettingsFields } from "./SettingsSection";
import { AdvancedSection, type AdvancedFields } from "./AdvancedSection";

import {
  SurfaceVariableBindingList,
  type BindingTarget,
} from "@/features/surfaces/admin/columns/SurfaceVariableBinding";
import {
  loadBindingsForAgent,
  loadSurfaceValues,
} from "@/features/surfaces/redux/thunks";
import {
  makeSelectBindingsForAgent,
  makeSelectSurfaceValues,
  makeSelectSurfaceValuesStatus,
} from "@/features/surfaces/redux/selectors";
import { BASELINE_VALUES } from "@/features/surfaces/manifests/_baseline.manifest";

import type { AgentShortcut } from "@/features/agents/redux/agent-shortcuts/types";
import type {
  SurfaceValue,
  ValueMapping,
  ValueMappingMap,
} from "@/features/surfaces/types";
import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { ResultDisplayMode } from "@/features/agents/utils/run-ui-utils";

const DEFAULT_SURFACE_NAME = "matrx-default/default";

/**
 * The new shortcut editor. Focused on the inputs the user must decide;
 * everything else is either pre-filled, hidden until needed, or moved
 * behind Advanced.
 *
 * The full agent record is passed in from the server route — looking it
 * up via Redux during SSR would yield undefined (the agentDefinition
 * slice isn't preloaded) and produce a hydration mismatch when the
 * client render finds the agent already present.
 */
export function ShortcutEditorNext({
  agent,
  shortcutId,
}: {
  agent: AgentDefinition;
  shortcutId: string;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const isNew = shortcutId === "new";
  const agentId = agent.id;
  const agentName = agent.name;

  // ── Existing shortcut hydration ────────────────────────────────────────
  const existing = useAppSelector((s) =>
    !isNew ? selectShortcutById(s, shortcutId) : null,
  );
  useEffect(() => {
    if (!isNew) {
      void dispatch(fetchFullShortcut(shortcutId));
    }
  }, [dispatch, shortcutId, isNew]);

  // ── Category tree ─────────────────────────────────────────────────────
  // Picker shows the full set of categories the user can pick from:
  // global + their personal + their active org. Single-scope fetches
  // miss two-thirds of what's available.
  const currentUserId = useAppSelector((s) => s.userAuth?.id ?? null);
  const activeOrgId = useAppSelector((s) => {
    const orgState = (
      s as unknown as {
        organizations?: { activeOrganizationId?: string | null };
      }
    ).organizations;
    return orgState?.activeOrganizationId ?? null;
  });

  useEffect(() => {
    void dispatch(fetchCategoriesForScope({ scope: "global", scopeId: null }));
    void dispatch(fetchCategoriesForScope({ scope: "user", scopeId: null }));
    if (activeOrgId) {
      void dispatch(
        fetchCategoriesForScope({
          scope: "organization",
          scopeId: activeOrgId,
        }),
      );
    }
  }, [dispatch, activeOrgId]);

  const allLoadedCategories = useAppSelector(selectAllCategoriesArray);
  const categories = useMemo(
    () =>
      allLoadedCategories.filter((c) => {
        if (!c.isActive) return false;
        const isGlobal =
          c.userId == null &&
          c.organizationId == null &&
          c.projectId == null &&
          c.taskId == null;
        if (isGlobal) return true;
        if (currentUserId && c.userId === currentUserId) return true;
        if (activeOrgId && c.organizationId === activeOrgId) return true;
        return false;
      }),
    [allLoadedCategories, currentUserId, activeOrgId],
  );

  // ── Agent-surface bindings (used to seed mappings) ────────────────────
  const selectBindings = useMemo(
    () => makeSelectBindingsForAgent(agentId),
    [agentId],
  );
  const agentSurfaceBindings = useAppSelector(selectBindings);
  useEffect(() => {
    void dispatch(loadBindingsForAgent({ agentId }));
  }, [dispatch, agentId]);

  // ── Form state ────────────────────────────────────────────────────────
  const [form, setForm] = useState<EditableShortcut>(() =>
    existing ? hydrateFromShortcut(existing) : freshDraft(),
  );
  // Re-hydrate when the existing record arrives or changes
  useEffect(() => {
    if (existing) setForm(hydrateFromShortcut(existing));
  }, [existing]);

  // Default the label to the agent's name on new drafts. Only auto-fills
  // while the field is empty — we never overwrite something the user
  // started typing.
  useEffect(() => {
    if (!isNew) return;
    if (!agentName) return;
    setForm((prev) => (prev.label.trim() ? prev : { ...prev, label: agentName }));
  }, [isNew, agentName]);

  const update = useCallback(
    <K extends keyof EditableShortcut>(field: K, next: EditableShortcut[K]) => {
      setForm((prev) => ({ ...prev, [field]: next }));
    },
    [],
  );

  // ── Surface values for the selected surface ───────────────────────────
  useEffect(() => {
    if (!form.surfaceName) return;
    void dispatch(loadSurfaceValues({ surfaceName: form.surfaceName }));
  }, [dispatch, form.surfaceName]);
  const selectSurfaceValues = useMemo(
    () => makeSelectSurfaceValues(form.surfaceName ?? ""),
    [form.surfaceName],
  );
  const selectSurfaceValuesStatus = useMemo(
    () => makeSelectSurfaceValuesStatus(form.surfaceName ?? ""),
    [form.surfaceName],
  );
  const surfaceValues = useAppSelector(selectSurfaceValues);
  const surfaceValuesStatus = useAppSelector(selectSurfaceValuesStatus);
  const loadingValues = surfaceValuesStatus === "loading";

  const availableSurfaceValues = useMemo<SurfaceValue[]>(() => {
    const byName = new Map<string, SurfaceValue>();
    for (const v of Object.values(BASELINE_VALUES)) byName.set(v.name, v);
    for (const v of surfaceValues) byName.set(v.name, v);
    return Array.from(byName.values()).sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
  }, [surfaceValues]);

  // ── Auto-seed mappings from the agent's existing binding on this
  // surface, the first time a fresh draft picks a surface.
  const hasSeededFromBinding = useStableRef(false);
  useEffect(() => {
    if (!isNew) return;
    if (!form.surfaceName) return;
    if (hasSeededFromBinding.current) return;
    const sameSurfaceBinding = agentSurfaceBindings.find(
      (b) => b.surfaceName === form.surfaceName,
    );
    if (sameSurfaceBinding) {
      setForm((prev) => ({
        ...prev,
        valueMappings: cloneMappings(sameSurfaceBinding.valueMappings),
      }));
      hasSeededFromBinding.current = true;
    }
  }, [isNew, form.surfaceName, agentSurfaceBindings, hasSeededFromBinding]);

  // ── Variable targets the user can map ────────────────────────────────
  const targets = useMemo<BindingTarget[]>(
    () => buildBindingTargets(agent),
    [agent],
  );

  // ── Save ──────────────────────────────────────────────────────────────
  const crud = useAgentShortcutCrud({ scope: "user" });
  const [busy, setBusy] = useState(false);

  const validate = (): string | null => {
    if (!form.label.trim()) return "Label is required";
    if (!form.categoryId) return "Pick a category";
    if (!form.surfaceName) return "Pick a surface";
    return null;
  };

  const onSave = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      if (isNew) {
        const newId = await crud.createShortcut(
          editableToFormData(form, agent),
        );
        toast.success("Shortcut created");
        router.replace(`/agents/${agentId}/shortcuts/${newId}`);
      } else {
        await crud.updateShortcut(shortcutId, editableToPatch(form));
        toast.success("Shortcut saved");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (isNew) return;
    const ok = await confirm({
      title: "Delete shortcut?",
      description: `This permanently removes "${form.label}". This action cannot be undone.`,
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      await crud.deleteShortcut(shortcutId);
      toast.success("Shortcut deleted");
      router.replace(`/agents/${agentId}/shortcuts`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  };

  const onCancel = () => router.back();

  return (
    <div className="h-full flex flex-col bg-background pt-[var(--shell-header-h)]">
      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-8">
          <Section title="Surface" hint="Where this shortcut shows up.">
            <SurfacePicker
              surfaceName={form.surfaceName}
              onChange={(next) => {
                // Switching surface clears the seed flag so the new
                // surface's existing binding (if any) re-seeds the
                // mappings — only on the first surface pick per draft.
                hasSeededFromBinding.current = false;
                update("surfaceName", next);
              }}
              disabled={busy}
            />
          </Section>

          <Section title="Category">
            <CategoryPicker
              categories={categories}
              value={form.categoryId}
              onChange={(next) => update("categoryId", next)}
              disabled={busy}
            />
          </Section>

          <Section title="Version">
            <CompactVersionPicker
              agentId={agentId}
              agentVersionId={form.agentVersionId}
              useLatest={form.useLatest}
              onAgentVersionIdChange={(next) => update("agentVersionId", next)}
              onUseLatestChange={(next) => update("useLatest", next)}
              disabled={busy}
            />
          </Section>

          <Section
            title="Widget"
            hint="How results are presented to the user."
          >
            <WidgetPicker
              value={form.displayMode}
              onChange={(next) => update("displayMode", next)}
              disabled={busy}
            />
          </Section>

          <Section title="Settings">
            <SettingsSection
              value={form}
              onChange={(field, next) =>
                update(field as keyof EditableShortcut, next as never)
              }
              disabled={busy}
            />
          </Section>

          <Section
            title="Variable & context mappings"
            hint={
              loadingValues
                ? "Loading surface values…"
                : "Start from the agent's surface binding when one exists."
            }
          >
            <SurfaceVariableBindingList
              targets={targets}
              value={form.valueMappings}
              availableSurfaceValues={availableSurfaceValues}
              disabled={busy}
              onChange={(next) => update("valueMappings", next)}
            />
            {form.surfaceName === DEFAULT_SURFACE_NAME && (
              <div className="mt-3 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground flex items-start gap-2">
                <Sparkles className="h-3 w-3 mt-0.5 shrink-0" />
                <span>
                  You&rsquo;re editing on the Default surface — these mappings
                  pre-fill every new shortcut on every other surface for this
                  agent.
                </span>
              </div>
            )}
          </Section>

          {/* Label sits at the bottom — by the time users get here, they
              know what this shortcut does and a sane name (the agent's
              name) is already in the box. */}
          <Section
            title="Label"
            hint="What the user sees in menus. Defaults to the agent name."
          >
            <Input
              value={form.label}
              onChange={(e) => update("label", e.target.value)}
              placeholder={agentName}
              disabled={busy}
              className="h-11 text-base font-medium"
              style={{ fontSize: "16px" }}
            />
          </Section>

          <AdvancedSection
            value={form}
            onChange={(field, next) =>
              update(field as keyof EditableShortcut, next as never)
            }
            disabled={busy}
          />
        </div>
      </div>

      {/* Sticky footer */}
      <footer className="shrink-0 px-6 py-3 border-t border-border bg-background flex items-center gap-2">
        {!isNew && (
          <Button
            variant="ghost"
            onClick={() => void onDelete()}
            disabled={busy}
            className="h-9 gap-1.5 text-sm text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={onCancel}
            disabled={busy}
            className="h-9 text-sm"
          >
            Cancel
          </Button>
          <Button
            onClick={() => void onSave()}
            disabled={busy}
            className="h-9 gap-1.5 text-sm min-w-[120px]"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isNew ? "Create shortcut" : "Save"}
          </Button>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Editable model — a thin projection of AgentShortcut tuned for the form
// ─────────────────────────────────────────────────────────────────────────

type EditableShortcut = Omit<
  AgentShortcut,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "resolvedId"
  | "isVersion"
  | "agentName"
  | "variableDefinitions"
  | "contextSlots"
  | "agentId"
> & SettingsFields;

function freshDraft(): EditableShortcut {
  return {
    categoryId: "",
    label: "",
    description: null,
    iconName: null,
    keyboardShortcut: null,
    sortOrder: 0,
    agentVersionId: null,
    useLatest: false,
    enabledFeatures: [],
    surfaceName: null,
    scopeMappings: null,
    valueMappings: {},
    contextMappings: null,
    displayMode: "modal-full",
    showVariablePanel: true,
    variablesPanelStyle: "inline",
    autoRun: false,
    allowChat: true,
    showDefinitionMessages: false,
    showDefinitionMessageContent: false,
    hideReasoning: false,
    hideToolResults: false,
    responseDensity: "comfortable",
    showPreExecutionGate: false,
    preExecutionMessage: null,
    bypassGateSeconds: 3,
    defaultUserInput: null,
    defaultVariables: null,
    contextOverrides: null,
    llmOverrides: null,
    jsonExtraction: null,
    isActive: true,
    userId: null,
    organizationId: null,
    projectId: null,
    taskId: null,
  };
}

function hydrateFromShortcut(s: AgentShortcut): EditableShortcut {
  return {
    categoryId: s.categoryId,
    label: s.label,
    description: s.description,
    iconName: s.iconName,
    keyboardShortcut: s.keyboardShortcut,
    sortOrder: s.sortOrder,
    agentVersionId: s.agentVersionId,
    useLatest: s.useLatest,
    enabledFeatures: s.enabledFeatures,
    surfaceName: s.surfaceName,
    scopeMappings: s.scopeMappings,
    valueMappings: s.valueMappings ?? {},
    contextMappings: s.contextMappings,
    displayMode: s.displayMode,
    showVariablePanel: s.showVariablePanel,
    variablesPanelStyle: s.variablesPanelStyle,
    autoRun: s.autoRun,
    allowChat: s.allowChat,
    showDefinitionMessages: s.showDefinitionMessages,
    showDefinitionMessageContent: s.showDefinitionMessageContent,
    hideReasoning: s.hideReasoning,
    hideToolResults: s.hideToolResults,
    responseDensity: s.responseDensity,
    showPreExecutionGate: s.showPreExecutionGate,
    preExecutionMessage: s.preExecutionMessage,
    bypassGateSeconds: s.bypassGateSeconds,
    defaultUserInput: s.defaultUserInput,
    defaultVariables: s.defaultVariables,
    contextOverrides: s.contextOverrides,
    llmOverrides: s.llmOverrides,
    jsonExtraction: s.jsonExtraction,
    isActive: s.isActive,
    userId: s.userId,
    organizationId: s.organizationId,
    projectId: s.projectId,
    taskId: s.taskId,
  };
}

function editableToFormData(form: EditableShortcut, agent: AgentDefinition) {
  return {
    ...form,
    agentId: agent.id,
    agentName: agent.name,
    variableDefinitions: agent.variableDefinitions ?? [],
    contextSlots: agent.contextSlots ?? [],
    resolvedId: form.useLatest ? agent.id : form.agentVersionId ?? agent.id,
    isVersion: !form.useLatest && form.agentVersionId != null,
  };
}

function editableToPatch(form: EditableShortcut): Partial<AgentShortcut> {
  // updateShortcut takes Partial<AgentShortcut>; passing a wide patch is
  // fine — the converter only ships fields that were set.
  return { ...form };
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

function buildBindingTargets(agent: AgentDefinition): BindingTarget[] {
  const out: BindingTarget[] = [];
  const seen = new Set<string>();
  for (const v of agent.variableDefinitions ?? []) {
    if (seen.has(v.name)) continue;
    seen.add(v.name);
    out.push({
      name: v.name,
      description: v.helpText,
      required: v.required ?? false,
    });
  }
  for (const slot of agent.contextSlots ?? []) {
    if (seen.has(slot.key)) continue;
    seen.add(slot.key);
    out.push({ name: slot.key, label: slot.label, description: slot.description });
  }
  return out;
}

function cloneMappings(map: ValueMappingMap): ValueMappingMap {
  const out: ValueMappingMap = {};
  for (const [k, v] of Object.entries(map)) {
    out[k] = { ...v } as ValueMapping;
  }
  return out;
}

function useStableRef<T>(initial: T): { current: T } {
  // Tiny replacement for `useRef` that doesn't show up under Strict
  // Mode's double-invoke as "initial value changed" — the ref is
  // created once.
  const [ref] = useState(() => ({ current: initial }));
  return ref;
}

// ─────────────────────────────────────────────────────────────────────────
// Section wrapper
// ─────────────────────────────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {hint && (
          <p className="mt-0.5 text-[12px] text-muted-foreground leading-snug">
            {hint}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

// Marker: keep type imports used
type _ResultDisplayMode = ResultDisplayMode;
