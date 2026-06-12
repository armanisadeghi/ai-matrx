"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Layers,
  Loader2,
  Rocket,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

import { useAgentShortcuts } from "@/features/agent-shortcuts/hooks/useAgentShortcuts";
import {
  selectShortcutById,
  selectShortcutsByAgentId,
} from "@/features/agents/redux/agent-shortcuts/selectors";
import { fetchFullShortcut } from "@/features/agents/redux/agent-shortcuts/thunks";
import {
  bulkCreateShortcuts,
  bulkUpdateShortcuts,
} from "@/features/agents/redux/agent-shortcuts/thunks/bulkWriteShortcuts.thunk";
import { selectAllCategoriesArray } from "@/features/agents/redux/agent-shortcut-categories/selectors";
import { fetchCategoriesForScope } from "@/features/agents/redux/agent-shortcut-categories/thunks";
import {
  selectActiveSurfaces,
  selectSurfacesStatus,
} from "@/features/surfaces/redux/selectors";
import { loadSurfaces } from "@/features/surfaces/redux/thunks";

import type { AgentDefinition } from "@/features/agents/types/agent-definition.types";
import type { AgentShortcut } from "@/features/agent-shortcuts/types";
import type { ValueMapping } from "@/features/surfaces/types";

import {
  BatchSurfaceSelector,
  type UpdateCandidate,
} from "./BatchSurfaceSelector";
import { BatchFieldPicker } from "./BatchFieldPicker";
import { BatchGrid } from "./BatchGrid";
import {
  buildCreateFormData,
  buildUpdatePatch,
  cloneMappings,
  buildBindingTargets,
  defaultBindingStates,
  perRowBindingTargets,
  perRowFields,
  resolveScalar,
  rowAttention,
  seedCreateMappings,
  type BatchContext,
  type BatchRow,
  type BatchScalarFieldKey,
  type BindingStateMap,
  type FieldMode,
  type FieldStateMap,
  STANDARD_DEFAULTS,
} from "./batchModel";

const STANDARD = "standard";

function parseKey(key: string): { kind: "create" | "update"; id: string } {
  const i = key.indexOf(":");
  return { kind: key.slice(0, i) as "create" | "update", id: key.slice(i + 1) };
}

export function BatchShortcutsEditor({ agent }: { agent: AgentDefinition }) {
  const dispatch = useAppDispatch();
  const router = useRouter();

  // ── Hydration ───────────────────────────────────────────────────────────
  useAgentShortcuts({ scope: "user" });
  useAgentShortcuts({ scope: "global" });

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

  useEffect(() => {
    void dispatch(loadSurfaces());
  }, [dispatch]);

  const allCategories = useAppSelector(selectAllCategoriesArray);
  const categoryOptions = useMemo(
    () =>
      allCategories
        .filter((c) => {
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
        })
        .map((c) => ({ value: c.id, label: c.label })),
    [allCategories, currentUserId, activeOrgId],
  );

  const surfaces = useAppSelector(selectActiveSurfaces);
  const surfacesStatus = useAppSelector(selectSurfacesStatus);
  const shortcutsForAgent = useAppSelector((s) =>
    selectShortcutsByAgentId(s, agent.id),
  );

  // ── Editor state ──────────────────────────────────────────────────────────
  const [templateId, setTemplateId] = useState<string>(STANDARD);
  /** True once the user has explicitly chosen a template (suppresses auto-default). */
  const templateTouched = useRef(false);
  const onTemplateChange = useCallback((id: string) => {
    templateTouched.current = true;
    setTemplateId(id);
    setAppliedKeys(new Set());
    setResult(null);
  }, []);
  const [fieldStates, setFieldStates] = useState<FieldStateMap>({});
  const [bindingStates, setBindingStates] = useState<BindingStateMap>({});
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [rowsByKey, setRowsByKey] = useState<Record<string, BatchRow>>({});
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [hideComplete, setHideComplete] = useState(false);
  /** Keys that have been successfully written this session. */
  const [appliedKeys, setAppliedKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [result, setResult] = useState<{
    created: number;
    updated: number;
    failed: { key: string; error: string }[];
  } | null>(null);

  // Full template record (ensure full config is loaded before seeding).
  useEffect(() => {
    if (templateId !== STANDARD) void dispatch(fetchFullShortcut(templateId));
  }, [templateId, dispatch]);
  const templateRecord = useAppSelector((s) =>
    templateId === STANDARD ? undefined : selectShortcutById(s, templateId),
  );
  const template = (templateRecord as AgentShortcut | undefined) ?? null;

  const targets = useMemo(() => buildBindingTargets(agent), [agent]);

  // Initialize / reset per-target binding state when the template changes.
  // Every target defaults to per-row (the whole point of this tool).
  useEffect(() => {
    setBindingStates(defaultBindingStates(targets, template));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, template, targets]);

  const ctx: BatchContext = useMemo(
    () => ({ agent, template, fieldStates, bindingStates }),
    [agent, template, fieldStates, bindingStates],
  );

  // Template candidates (any existing shortcut for this agent).
  const templateCandidates = useMemo(
    () =>
      shortcutsForAgent
        .map((s) => ({ id: s.id, label: s.label || "(untitled)" }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [shortcutsForAgent],
  );

  // Default to the first existing shortcut as template — it's always closer to
  // intent than blank standard defaults. Only until the user picks one.
  useEffect(() => {
    if (templateTouched.current) return;
    if (templateId !== STANDARD) return;
    if (templateCandidates.length > 0) {
      setTemplateId(templateCandidates[0].id);
    }
  }, [templateCandidates, templateId]);

  const templateSurfaceName = useMemo(() => {
    if (templateId === STANDARD) return null;
    const sc = shortcutsForAgent.find((s) => s.id === templateId);
    return sc?.surfaceName ?? null;
  }, [templateId, shortcutsForAgent]);

  // Update candidates — every existing shortcut EXCEPT the chosen template
  // (updating the template itself never makes sense in a batch).
  const updateCandidates = useMemo<UpdateCandidate[]>(
    () =>
      shortcutsForAgent
        .filter((s) => s.id !== templateId && !!s.surfaceName)
        .map((s) => ({
          shortcutId: s.id,
          label: s.label || "(untitled)",
          surfaceName: s.surfaceName as string,
        })),
    [shortcutsForAgent, templateId],
  );

  const existingSurfaceNames = useMemo(
    () =>
      new Set(
        shortcutsForAgent
          .filter((s) => !!s.surfaceName)
          .map((s) => s.surfaceName as string),
      ),
    [shortcutsForAgent],
  );

  // ── Row sync — add/remove rows to match the selection ─────────────────────
  useEffect(() => {
    setRowsByKey((prev) => {
      const next: Record<string, BatchRow> = {};
      for (const key of selectedKeys) {
        if (prev[key]) {
          next[key] = prev[key];
          continue;
        }
        const { kind, id } = parseKey(key);
        if (kind === "create") {
          next[key] = {
            key,
            kind: "create",
            surfaceName: id,
            overrides: {},
            valueMappings: seedCreateMappings(template?.valueMappings ?? null),
          };
        } else {
          const sc = shortcutsForAgent.find((s) => s.id === id);
          next[key] = {
            key,
            kind: "update",
            surfaceName: sc?.surfaceName ?? "",
            shortcutId: id,
            existingLabel: sc?.label ?? undefined,
            existing: (sc as AgentShortcut | undefined) ?? undefined,
            overrides: {},
            valueMappings: cloneMappings(sc?.valueMappings ?? null),
          };
        }
      }
      return next;
    });
    // template intentionally excluded; template changes reseed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKeys]);

  // Reseed CREATE rows when the template's full data arrives / changes.
  useEffect(() => {
    setRowsByKey((prev) => {
      const next: Record<string, BatchRow> = {};
      for (const [k, row] of Object.entries(prev)) {
        next[k] =
          row.kind === "create"
            ? {
                ...row,
                valueMappings: seedCreateMappings(
                  template?.valueMappings ?? null,
                ),
              }
            : row;
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId, template]);

  const rows = useMemo(
    () =>
      selectedKeys.map((k) => rowsByKey[k]).filter((r): r is BatchRow => !!r),
    [selectedKeys, rowsByKey],
  );
  const perRowKeys = useMemo(() => perRowFields(ctx), [ctx]);
  const bindingColumns = useMemo(
    () => perRowBindingTargets(ctx, targets),
    [ctx, targets],
  );

  // ── Selection handlers ────────────────────────────────────────────────────
  const onToggle = useCallback((key: string) => {
    setSelectedKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  }, []);
  const onSetSelection = useCallback((keys: string[]) => {
    setSelectedKeys(keys);
  }, []);
  const onRemoveRow = useCallback((key: string) => {
    setSelectedKeys((prev) => prev.filter((k) => k !== key));
  }, []);
  /** Deselect every "Add" row whose surface already has a shortcut. */
  const onClearCollisions = useCallback(() => {
    setSelectedKeys((prev) =>
      prev.filter((k) => {
        const { kind, id } = parseKey(k);
        return !(kind === "create" && existingSurfaceNames.has(id));
      }),
    );
  }, [existingSurfaceNames]);

  // ── Field / binding handlers ──────────────────────────────────────────────
  const onFieldModeChange = useCallback(
    (key: BatchScalarFieldKey, m: FieldMode) => {
      setFieldStates((prev) => {
        const existing = prev[key];
        if (m === "inherit") {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return {
          ...prev,
          [key]: {
            mode: m,
            allValue: existing?.allValue ?? STANDARD_DEFAULTS[key],
          },
        };
      });
    },
    [],
  );
  const onFieldAllValueChange = useCallback(
    (key: BatchScalarFieldKey, value: unknown) => {
      setFieldStates((prev) => ({
        ...prev,
        [key]: { mode: prev[key]?.mode ?? "all", allValue: value },
      }));
    },
    [],
  );
  const onBindingModeChange = useCallback(
    (targetName: string, m: FieldMode) => {
      setBindingStates((prev) => ({
        ...prev,
        [targetName]: {
          mode: m,
          allValue: prev[targetName]?.allValue ?? { mapType: "unmapped" },
        },
      }));
    },
    [],
  );
  const onBindingAllValueChange = useCallback(
    (targetName: string, mapping: ValueMapping | null) => {
      setBindingStates((prev) => ({
        ...prev,
        [targetName]: {
          mode: prev[targetName]?.mode ?? "all",
          allValue: mapping ?? { mapType: "unmapped" },
        },
      }));
    },
    [],
  );

  const onRowOverrideChange = useCallback(
    (rowKey: string, fieldKey: BatchScalarFieldKey, value: unknown) => {
      setRowsByKey((prev) => {
        const row = prev[rowKey];
        if (!row) return prev;
        return {
          ...prev,
          [rowKey]: {
            ...row,
            overrides: { ...row.overrides, [fieldKey]: value },
          },
        };
      });
    },
    [],
  );
  const onRowMappingChange = useCallback(
    (rowKey: string, targetName: string, mapping: ValueMapping | null) => {
      setRowsByKey((prev) => {
        const row = prev[rowKey];
        if (!row) return prev;
        const nextMappings = { ...row.valueMappings };
        if (mapping === null) delete nextMappings[targetName];
        else nextMappings[targetName] = mapping;
        return { ...prev, [rowKey]: { ...row, valueMappings: nextMappings } };
      });
    },
    [],
  );

  const onFillScalar = useCallback(
    (fieldKey: BatchScalarFieldKey, value: unknown) => {
      setRowsByKey((prev) => {
        const next: Record<string, BatchRow> = {};
        for (const [k, row] of Object.entries(prev)) {
          next[k] = {
            ...row,
            overrides: { ...row.overrides, [fieldKey]: value },
          };
        }
        return next;
      });
    },
    [],
  );
  const onFillBinding = useCallback(
    (targetName: string, mapping: ValueMapping | null) => {
      setRowsByKey((prev) => {
        const next: Record<string, BatchRow> = {};
        for (const [k, row] of Object.entries(prev)) {
          const nextMappings = { ...row.valueMappings };
          if (mapping === null) delete nextMappings[targetName];
          else nextMappings[targetName] = { ...mapping } as ValueMapping;
          next[k] = { ...row, valueMappings: nextMappings };
        }
        return next;
      });
    },
    [],
  );

  // ── Tally ───────────────────────────────────────────────────────────────
  const tally = useMemo(() => {
    let needsAttention = 0;
    let collide = 0;
    let createCount = 0;
    let updateCount = 0;
    for (const row of rows) {
      if (rowAttention(ctx, row, targets).unmapped > 0) needsAttention += 1;
      if (row.kind === "create") {
        createCount += 1;
        if (existingSurfaceNames.has(row.surfaceName)) collide += 1;
      } else {
        updateCount += 1;
      }
    }
    return { needsAttention, collide, createCount, updateCount };
  }, [rows, ctx, targets, existingSurfaceNames]);

  // ── Apply (true batch — two writes total, not N) ───────────────────────────
  const onApply = useCallback(async () => {
    // Only act on rows not already written this session.
    const pending = rows.filter((r) => !appliedKeys.has(r.key));
    if (pending.length === 0) {
      toast.error("Nothing left to apply — everything is already done.");
      return;
    }
    const missingCategory = pending.some(
      (r) =>
        r.kind === "create" &&
        !String(resolveScalar(ctx, r, "categoryId") ?? "").trim(),
    );
    if (missingCategory) {
      toast.error(
        "New shortcuts need a category — pick a template that has one, or set the Category field.",
      );
      return;
    }
    const requiredUnmapped = pending.reduce(
      (acc, r) => acc + rowAttention(ctx, r, targets).requiredUnmapped,
      0,
    );
    if (requiredUnmapped > 0) {
      toast.error(
        `${requiredUnmapped} required variable binding(s) are still unmapped. Fix the red cells first.`,
      );
      return;
    }

    const createRows = pending.filter((r) => r.kind === "create");
    const updateRows = pending.filter((r) => r.kind === "update");

    setApplying(true);
    setResult(null);
    setProgress({ done: 0, total: pending.length });

    const failed: { key: string; error: string }[] = [];
    const succeeded: string[] = [];
    let created = 0;
    let updated = 0;

    // CREATE — one multi-row insert.
    if (createRows.length > 0) {
      try {
        const drafts = createRows.map((r) =>
          buildCreateFormData(ctx, r, targets),
        );
        await dispatch(bulkCreateShortcuts(drafts)).unwrap();
        created = createRows.length;
        for (const r of createRows) succeeded.push(r.key);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Bulk create failed";
        for (const r of createRows) failed.push({ key: r.key, error: msg });
      }
      setProgress((p) => (p ? { ...p, done: createRows.length } : p));
    }

    // UPDATE — one multi-row upsert of fully-merged rows.
    if (updateRows.length > 0) {
      try {
        const merged = updateRows
          .filter((r) => r.existing)
          .map((r) => ({
            ...(r.existing as AgentShortcut),
            ...buildUpdatePatch(ctx, r, targets),
            id: r.shortcutId as string,
          }));
        await dispatch(bulkUpdateShortcuts(merged)).unwrap();
        updated = merged.length;
        for (const r of updateRows) succeeded.push(r.key);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Bulk update failed";
        for (const r of updateRows) failed.push({ key: r.key, error: msg });
      }
      setProgress((p) =>
        p ? { ...p, done: createRows.length + updateRows.length } : p,
      );
    }

    if (succeeded.length > 0) {
      setAppliedKeys((prev) => {
        const next = new Set(prev);
        for (const k of succeeded) next.add(k);
        return next;
      });
    }

    setApplying(false);
    setResult({ created, updated, failed });
    if (failed.length === 0) {
      const parts = [
        created ? `${created} created` : "",
        updated ? `${updated} updated` : "",
      ].filter(Boolean);
      toast.success(parts.join(" · ") || "Done.");
    } else {
      toast.error(`${created + updated} succeeded · ${failed.length} failed.`);
    }
  }, [rows, appliedKeys, ctx, targets, dispatch]);

  // ── Render ──────────────────────────────────────────────────────────────
  const pendingCount = rows.filter((r) => !appliedKeys.has(r.key)).length;
  const doneCount = rows.length - pendingCount;

  return (
    <div className="h-full flex flex-col bg-background pt-[var(--shell-header-h)]">
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="mx-auto w-full max-w-[1400px] px-4 sm:px-6 py-4 space-y-4">
          {/* Compact template bar */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
            <Layers className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-semibold text-foreground truncate max-w-[260px]">
              {agent.name}
            </span>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs font-medium text-muted-foreground">
              Template
            </span>
            <Select value={templateId} onValueChange={onTemplateChange}>
              <SelectTrigger className="h-8 w-[240px] text-sm">
                <SelectValue placeholder="Standard defaults" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={STANDARD}>Standard defaults</SelectItem>
                {templateCandidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templateId !== STANDARD && !template && (
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> loading…
              </span>
            )}
            <span className="text-[11px] text-muted-foreground ml-auto hidden sm:block">
              Unset fields inherit from{" "}
              {templateId === STANDARD ? "standard defaults" : "the template"}.
            </span>
          </div>

          {/* Zone 1 — pick targets */}
          <Section
            step="1"
            title="Surfaces & shortcuts"
            hint="Add new ones, update existing ones — in one pass."
          >
            <BatchSurfaceSelector
              surfaces={surfaces}
              loading={surfacesStatus === "loading" && surfaces.length === 0}
              existingSurfaceNames={existingSurfaceNames}
              templateSurfaceName={templateSurfaceName}
              updateCandidates={updateCandidates}
              selected={new Set(selectedKeys)}
              onToggle={onToggle}
              onSetSelection={onSetSelection}
            />
            {tally.collide > 0 && (
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-amber-600 dark:text-amber-400">
                <TriangleAlert className="h-3 w-3 shrink-0" />
                <span className="min-w-0">
                  {tally.collide} surface(s) marked "Add" already have a shortcut
                  — this creates an additional one. Use "Update existing" to edit
                  instead.
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[11px] shrink-0"
                  onClick={onClearCollisions}
                >
                  Clear {tally.collide}
                </Button>
              </div>
            )}
          </Section>

          {/* Zone 2 — fields */}
          <Section
            step="2"
            title="Customize fields"
            hint="Inherit from the template, set one value for all, or vary per-row."
          >
            <BatchFieldPicker
              fieldStates={fieldStates}
              bindingStates={bindingStates}
              targets={targets}
              template={template}
              categoryOptions={categoryOptions}
              onFieldModeChange={onFieldModeChange}
              onFieldAllValueChange={onFieldAllValueChange}
              onBindingModeChange={onBindingModeChange}
              onBindingAllValueChange={onBindingAllValueChange}
            />
          </Section>

          {/* Zone 3 — grid */}
          <Section
            step="3"
            title="Grid"
            hint="Each per-row field is a column. Use the fill-down on a header to set every row at once."
            action={
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={attentionOnly}
                    onChange={(e) => setAttentionOnly(e.target.checked)}
                    className="accent-primary"
                  />
                  Needs attention only
                </label>
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={hideComplete}
                    onChange={(e) => setHideComplete(e.target.checked)}
                    className="accent-primary"
                  />
                  Hide complete
                </label>
              </div>
            }
          >
            <BatchGrid
              ctx={ctx}
              rows={rows}
              targets={targets}
              bindingColumns={bindingColumns}
              perRowFieldKeys={perRowKeys}
              categoryOptions={categoryOptions}
              attentionOnly={attentionOnly}
              hideComplete={hideComplete}
              appliedKeys={appliedKeys}
              onRowOverrideChange={onRowOverrideChange}
              onRowMappingChange={onRowMappingChange}
              onRemoveRow={onRemoveRow}
              onFillScalar={onFillScalar}
              onFillBinding={onFillBinding}
            />
          </Section>

          {/* Result */}
          {result && (
            <div
              className={cn(
                "rounded-lg border px-3 py-2 text-sm",
                result.failed.length === 0
                  ? "border-emerald-300/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-amber-300/60 bg-amber-500/10 text-amber-700 dark:text-amber-300",
              )}
            >
              <div className="flex items-center gap-2 font-medium">
                {result.failed.length === 0 ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <TriangleAlert className="h-4 w-4" />
                )}
                {result.created} created · {result.updated} updated
                {result.failed.length > 0 &&
                  ` · ${result.failed.length} failed`}
              </div>
              {result.failed.length > 0 && (
                <ul className="mt-1 text-[11px] font-mono space-y-0.5">
                  {result.failed.slice(0, 6).map((f) => (
                    <li key={f.key} className="truncate">
                      {f.key}: {f.error}
                    </li>
                  ))}
                </ul>
              )}
              {result.failed.length === 0 && (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto p-0 mt-1 text-xs"
                  onClick={() => router.push(`/agents/${agent.id}/shortcuts`)}
                >
                  View all shortcuts →
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer */}
      <footer className="shrink-0 px-4 sm:px-6 py-3 border-t border-border bg-background">
        <div className="mx-auto w-full max-w-[1400px] flex items-center gap-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 text-foreground font-medium">
              <Layers className="h-3.5 w-3.5" />
              {tally.createCount} add · {tally.updateCount} update
            </span>
            {doneCount > 0 && (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {doneCount} done
              </span>
            )}
            {tally.needsAttention > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <TriangleAlert className="h-3.5 w-3.5" />
                {tally.needsAttention} need attention
              </span>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {progress && applying && (
              <span className="text-xs text-muted-foreground">
                {progress.done}/{progress.total}
              </span>
            )}
            <Button
              onClick={() => void onApply()}
              disabled={applying || pendingCount === 0}
              className="h-9 gap-1.5 text-sm min-w-[150px]"
            >
              {applying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4" />
              )}
              {applying ? "Applying…" : `Apply ${pendingCount || ""}`.trim()}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Local presentational helpers
// ─────────────────────────────────────────────────────────────────────────────

function Section({
  step,
  title,
  hint,
  action,
  children,
}: {
  step: string;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2.5">
        <span className="shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center">
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          {hint && (
            <p className="text-[11px] text-muted-foreground leading-snug">
              {hint}
            </p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
