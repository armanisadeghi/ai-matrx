"use client";

/**
 * useShortcutQuickCreate
 *
 * The single source of truth for the "Create Shortcut" window. Owns every
 * piece of form state, every redux-backed read, and every save/link/reset
 * operation. Both the window shell (footer + header actions + sidebar
 * tab-nav) and the body (individual tab panes) read from the same hook
 * instance so they can't drift.
 *
 * Keeping all state here also lets us answer:
 *   - "what would the row look like if I saved right now?" — via buildPayload,
 *     used by the JSON tab to seed its draft.
 *   - "is the JSON the user typed valid?" — via parseJsonDraft, called once
 *     at save time per the UX rule: never validate as the user types.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/slices/userSlice";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { DEFAULT_AGENT_EXECUTION_CONFIG } from "@/features/agents/types/agent-execution-config.types";
import type { ResultDisplayMode } from "@/features/agents/types/instance.types";
import type { VariablesPanelStyle } from "@/features/agents/components/inputs/variable-input-variations/variable-input-options";
import type { VariableDefinition } from "@/features/agents/types/agent-definition.types";
import {
  isValidShortcutContext,
  type ShortcutContext,
} from "@/features/agents/utils/shortcut-context-utils";
import type { AgentScope } from "../constants";
import { PLACEMENT_TYPES } from "../constants";
import { useAgentShortcuts } from "./useAgentShortcuts";
import { useAgentShortcutCrud } from "./useAgentShortcutCrud";
import type { ShortcutFormData } from "../types";
import type { AgentVariableDefinition } from "../components/ScopeMappingEditor";

// ───────────────────────────────────────────────────────────────────────────
// Tabs
// ───────────────────────────────────────────────────────────────────────────

export type QuickCreateTab =
  | "essentials"
  | "variables"
  | "details"
  | "advanced"
  | "link"
  | "json";

export const QUICK_CREATE_TABS: readonly QuickCreateTab[] = [
  "essentials",
  "variables",
  "details",
  "advanced",
  "link",
  "json",
] as const;

export function isQuickCreateTab(value: unknown): value is QuickCreateTab {
  return (
    typeof value === "string" &&
    (QUICK_CREATE_TABS as readonly string[]).includes(value)
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Defaults
// ───────────────────────────────────────────────────────────────────────────

export const DEFAULT_ICON = "MousePointerClick";
export const DEFAULT_SURFACE: ShortcutContext = "general";
export const FALLBACK_CATEGORY_LABEL = "My Shortcuts";
export const FALLBACK_SHORTCUT_LABEL = "Untitled shortcut";

// Marker used in JSON previews when the user hasn't picked a category yet.
// parseJsonDraft swaps it out for a real category id at save time.
export const CATEGORY_PLACEHOLDER = "<will-create>";

// ───────────────────────────────────────────────────────────────────────────
// Hook
// ───────────────────────────────────────────────────────────────────────────

export interface UseShortcutQuickCreateArgs {
  agentId: string;
  activeTab: QuickCreateTab;
  onActiveTabChange: (next: QuickCreateTab) => void;
  onClose: () => void;
  onSuccess?: (shortcutId: string) => void;
}

export function useShortcutQuickCreate({
  agentId,
  activeTab,
  onActiveTabChange,
  onClose,
  onSuccess,
}: UseShortcutQuickCreateArgs) {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const isAdmin = useAppSelector(selectIsSuperAdmin);
  const agent = useAppSelector((s) => selectAgentById(s, agentId));

  useEffect(() => {
    dispatch(fetchAgentExecutionMinimal(agentId)).catch(() => {
      /* optional — only needed for the Variables tab */
    });
  }, [dispatch, agentId]);

  // ── Scope ────────────────────────────────────────────────────────────────
  // When an admin is creating a shortcut for a builtin/system agent, the
  // shortcut belongs to the system — not to the admin personally. Default
  // scope accordingly so the form loads global categories, not the admin's
  // own shortcuts. Falls back to "user" for regular agents or non-admins.
  const initialScope: AgentScope =
    agent?.agentType === "builtin" && isAdmin ? "global" : "user";
  const [scope, setScope] = useState<AgentScope>(initialScope);

  // Agents hydrate async; re-sync scope once the agent row lands so the first
  // render doesn't lock in "user" when we're actually in the builtin context.
  const syncedForAgent = useRef<string | null>(null);
  useEffect(() => {
    if (!agent?.agentType) return;
    if (syncedForAgent.current === agentId) return;
    const desired: AgentScope =
      agent.agentType === "builtin" && isAdmin ? "global" : "user";
    setScope(desired);
    syncedForAgent.current = agentId;
  }, [agent?.agentType, agentId, isAdmin]);

  const { shortcuts, categories } = useAgentShortcuts({
    scope,
    scopeId: undefined,
    autoFetch: true,
  });
  const crud = useAgentShortcutCrud({ scope, scopeId: undefined });

  // ── Identity / display ───────────────────────────────────────────────────
  const [label, setLabel] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [iconName, setIconName] = useState<string>(DEFAULT_ICON);
  const [keyboardShortcut, setKeyboardShortcut] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [enabledFeatures, setEnabledFeatures] = useState<ShortcutContext[]>([
    DEFAULT_SURFACE,
  ]);

  // ── Version ──────────────────────────────────────────────────────────────
  const [useLatest, setUseLatest] = useState<boolean>(false);
  const [agentVersionId, setAgentVersionId] = useState<string | null>(null);

  // ── Execution config ─────────────────────────────────────────────────────
  const [displayMode, setDisplayMode] = useState<ResultDisplayMode>(
    DEFAULT_AGENT_EXECUTION_CONFIG.displayMode,
  );
  const [showVariablePanel, setShowVariablePanel] = useState<boolean>(
    DEFAULT_AGENT_EXECUTION_CONFIG.showVariablePanel,
  );
  const [variablesPanelStyle, setVariablesPanelStyle] =
    useState<VariablesPanelStyle>(
      DEFAULT_AGENT_EXECUTION_CONFIG.variablesPanelStyle,
    );
  const [autoRun, setAutoRun] = useState<boolean>(
    DEFAULT_AGENT_EXECUTION_CONFIG.autoRun,
  );
  const [allowChat, setAllowChat] = useState<boolean>(
    DEFAULT_AGENT_EXECUTION_CONFIG.allowChat,
  );
  const [hideReasoning, setHideReasoning] = useState<boolean>(
    DEFAULT_AGENT_EXECUTION_CONFIG.hideReasoning,
  );
  const [hideToolResults, setHideToolResults] = useState<boolean>(
    DEFAULT_AGENT_EXECUTION_CONFIG.hideToolResults,
  );

  // ── Variables (defaults + scope mappings) ────────────────────────────────
  const [defaultVariables, setDefaultVariables] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [scopeMappings, setScopeMappings] = useState<Record<string, string>>(
    {},
  );

  // ── Link existing ────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedExistingId, setSelectedExistingId] = useState<string | null>(
    null,
  );
  const [showOnlyUnlinked, setShowOnlyUnlinked] = useState(true);

  // ── JSON tab (validated only at save time) ───────────────────────────────
  const [jsonDraft, setJsonDraft] = useState<string>("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // ── Save state ───────────────────────────────────────────────────────────
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── One-time seeding from the loaded agent ───────────────────────────────
  const seededForAgent = useRef<string | null>(null);
  useEffect(() => {
    if (!agent?.name) return;
    if (seededForAgent.current === agentId) return;
    setLabel(agent.name);
    setDescription(agent.description ?? "");
    seededForAgent.current = agentId;
  }, [agent?.name, agent?.description, agentId]);

  // ── Auto-pick a category when none selected ──────────────────────────────
  useEffect(() => {
    if (categoryId) return;
    if (categories.length > 0) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  // ── Reset scope-scoped selections when scope flips ───────────────────────
  useEffect(() => {
    setCategoryId("");
    setSelectedExistingId(null);
  }, [scope]);

  // ── Derived reads ────────────────────────────────────────────────────────
  const agentVariableDefs: VariableDefinition[] = useMemo(
    () => agent?.variableDefinitions ?? [],
    [agent?.variableDefinitions],
  );

  const variableDefsForScopeMapping = useMemo<AgentVariableDefinition[]>(
    () =>
      agentVariableDefs.map((d) => ({
        name: d.name,
        default_value: d.defaultValue,
        description: d.helpText ?? null,
      })),
    [agentVariableDefs],
  );

  const filteredExisting = useMemo(() => {
    let out = showOnlyUnlinked
      ? shortcuts.filter((s) => !s.agentId)
      : shortcuts;
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (s) =>
          s.label.toLowerCase().includes(q) ||
          (s.description ?? "").toLowerCase().includes(q),
      );
    }
    return out;
  }, [shortcuts, showOnlyUnlinked, searchQuery]);

  // ── Build the payload ────────────────────────────────────────────────────
  const buildPayload = useCallback(
    (resolvedCategoryId: string): ShortcutFormData => {
      const finalSurfaces: ShortcutContext[] =
        enabledFeatures.length > 0 ? enabledFeatures : [DEFAULT_SURFACE];
      const finalLabel =
        label.trim() || agent?.name?.trim() || FALLBACK_SHORTCUT_LABEL;

      return {
        // Identity
        categoryId: resolvedCategoryId,
        label: finalLabel,
        description: description.trim() || null,
        iconName: iconName.trim() || DEFAULT_ICON,
        keyboardShortcut: keyboardShortcut.trim() || null,
        sortOrder: 0,
        // Agent reference
        agentId,
        agentVersionId: useLatest ? null : agentVersionId,
        useLatest,
        // Derived execution target (server will resolve on create; provide
        // best-effort values so the slice has a valid record immediately)
        resolvedId: useLatest ? agentId : (agentVersionId ?? agentId),
        isVersion: !useLatest && agentVersionId != null,
        agentName: agent?.name ?? null,
        variableDefinitions: agent?.variableDefinitions ?? [],
        contextSlots: agent?.contextSlots ?? [],
        // Surfaces & scope routing
        enabledFeatures: finalSurfaces,
        surfaceName: null,
        scopeMappings:
          Object.keys(scopeMappings).length > 0 ? scopeMappings : null,
        valueMappings: null,
        contextMappings: null,
        // AgentExecutionConfig — defaults first, explicit overrides after
        ...DEFAULT_AGENT_EXECUTION_CONFIG,
        displayMode,
        showVariablePanel,
        variablesPanelStyle,
        autoRun,
        allowChat,
        hideReasoning,
        hideToolResults,
        defaultVariables,
        // Status
        isActive: true,
        // Scope wrapper fills userId / organizationId / projectId / taskId
        userId: null,
        organizationId: null,
        projectId: null,
        taskId: null,
      };
    },
    [
      agent?.name,
      agent?.variableDefinitions,
      agent?.contextSlots,
      agentId,
      agentVersionId,
      allowChat,
      autoRun,
      defaultVariables,
      description,
      displayMode,
      enabledFeatures,
      hideReasoning,
      hideToolResults,
      iconName,
      keyboardShortcut,
      label,
      scopeMappings,
      showVariablePanel,
      useLatest,
      variablesPanelStyle,
    ],
  );

  // ── Seed JSON draft when entering the JSON tab ───────────────────────────
  useEffect(() => {
    if (activeTab !== "json") return;
    const preview = buildPayload(categoryId || CATEGORY_PLACEHOLDER);
    setJsonDraft(JSON.stringify(preview, null, 2));
    setJsonError(null);
  }, [activeTab, buildPayload, categoryId]);

  // ── Ensure a real category id exists at save time ────────────────────────
  const ensureCategoryId = useCallback(async (): Promise<string> => {
    if (categoryId) return categoryId;
    if (categories.length > 0) return categories[0].id;
    const newId = await crud.createCategory({
      label: FALLBACK_CATEGORY_LABEL,
      placementType: PLACEMENT_TYPES.AI_ACTION,
      parentCategoryId: null,
      description: "",
      iconName: DEFAULT_ICON,
      color: "#6366f1",
      sortOrder: 0,
      isActive: true,
      enabledFeatures: [],
      metadata: {},
    });
    setCategoryId(newId);
    return newId;
  }, [categoryId, categories, crud]);

  // ── JSON draft validation (called only at save time) ─────────────────────
  const parseJsonDraft = useCallback((): ShortcutFormData | null => {
    let raw: unknown;
    try {
      raw = JSON.parse(jsonDraft);
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : "Invalid JSON");
      return null;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      setJsonError("Top-level value must be a JSON object");
      return null;
    }
    const obj = raw as Record<string, unknown>;
    const missing: string[] = [];
    if (typeof obj.label !== "string" || !obj.label.trim()) {
      missing.push("label");
    }
    if (
      typeof obj.categoryId !== "string" ||
      !obj.categoryId.trim() ||
      obj.categoryId === CATEGORY_PLACEHOLDER
    ) {
      // Fine — ensureCategoryId will substitute a real one.
    }
    if (!Array.isArray(obj.enabledFeatures)) {
      missing.push("enabledFeatures (array)");
    }
    if (missing.length > 0) {
      setJsonError(`Missing or invalid fields: ${missing.join(", ")}`);
      return null;
    }
    // Clamp surfaces to known values; silently drop unknown ones.
    const cleanedFeatures = (obj.enabledFeatures as unknown[]).filter(
      (v): v is ShortcutContext =>
        typeof v === "string" && isValidShortcutContext(v),
    );
    setJsonError(null);
    return {
      ...(obj as unknown as ShortcutFormData),
      // Never let the JSON tab retarget a different agent by accident.
      agentId,
      enabledFeatures:
        cleanedFeatures.length > 0 ? cleanedFeatures : [DEFAULT_SURFACE],
    };
  }, [agentId, jsonDraft]);

  // ── Save handlers ────────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      let payload: ShortcutFormData;
      if (activeTab === "json") {
        const parsed = parseJsonDraft();
        if (!parsed) {
          setIsSaving(false);
          return;
        }
        const needsRealCategory =
          !parsed.categoryId ||
          parsed.categoryId === CATEGORY_PLACEHOLDER ||
          !categories.some((c) => c.id === parsed.categoryId);
        payload = needsRealCategory
          ? { ...parsed, categoryId: await ensureCategoryId() }
          : parsed;
      } else {
        const resolvedCategoryId = await ensureCategoryId();
        payload = buildPayload(resolvedCategoryId);
      }
      const newId = await crud.createShortcut(payload);
      toast({
        title: "Shortcut created",
        description:
          scope === "global"
            ? `"${payload.label}" is now available globally.`
            : `"${payload.label}" added to your shortcuts.`,
      });
      onSuccess?.(newId);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create shortcut",
      );
    } finally {
      setIsSaving(false);
    }
  }, [
    activeTab,
    buildPayload,
    categories,
    crud,
    ensureCategoryId,
    onClose,
    onSuccess,
    parseJsonDraft,
    scope,
    toast,
  ]);

  const handleLinkExisting = useCallback(async () => {
    if (!selectedExistingId) {
      setError("Select a shortcut to link");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await crud.updateShortcut(selectedExistingId, {
        agentId,
        agentVersionId: useLatest ? null : agentVersionId,
        useLatest,
        scopeMappings:
          Object.keys(scopeMappings).length > 0 ? scopeMappings : null,
      });
      toast({
        title: "Linked",
        description: "Shortcut now points at this agent.",
      });
      onSuccess?.(selectedExistingId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to link shortcut");
    } finally {
      setIsSaving(false);
    }
  }, [
    agentId,
    agentVersionId,
    crud,
    onClose,
    onSuccess,
    scopeMappings,
    selectedExistingId,
    toast,
    useLatest,
  ]);

  const handlePrimary =
    activeTab === "link" ? handleLinkExisting : handleCreate;

  const primaryLabel =
    activeTab === "link" ? "Link shortcut" : "Create shortcut";

  const primaryDisabled =
    isSaving || (activeTab === "link" && !selectedExistingId);

  const resetToDefaults = useCallback(() => {
    setLabel(agent?.name ?? "");
    setDescription(agent?.description ?? "");
    setIconName(DEFAULT_ICON);
    setKeyboardShortcut("");
    setEnabledFeatures([DEFAULT_SURFACE]);
    setUseLatest(false);
    setAgentVersionId(null);
    setDisplayMode(DEFAULT_AGENT_EXECUTION_CONFIG.displayMode);
    setShowVariablePanel(DEFAULT_AGENT_EXECUTION_CONFIG.showVariablePanel);
    setVariablesPanelStyle(DEFAULT_AGENT_EXECUTION_CONFIG.variablesPanelStyle);
    setAutoRun(DEFAULT_AGENT_EXECUTION_CONFIG.autoRun);
    setAllowChat(DEFAULT_AGENT_EXECUTION_CONFIG.allowChat);
    setHideReasoning(DEFAULT_AGENT_EXECUTION_CONFIG.hideReasoning);
    setHideToolResults(DEFAULT_AGENT_EXECUTION_CONFIG.hideToolResults);
    setDefaultVariables(null);
    setScopeMappings({});
    setJsonError(null);
    setError(null);
    toast({ title: "Reset", description: "Form reset to defaults." });
  }, [agent?.description, agent?.name, toast]);

  return {
    // Identity / agent context
    agent,
    agentId,
    isAdmin,
    categories,

    // Tab nav
    activeTab,
    onActiveTabChange,

    // Scope
    scope,
    setScope,

    // Identity / display fields
    label,
    setLabel,
    description,
    setDescription,
    iconName,
    setIconName,
    keyboardShortcut,
    setKeyboardShortcut,
    categoryId,
    setCategoryId,
    enabledFeatures,
    setEnabledFeatures,

    // Version
    useLatest,
    setUseLatest,
    agentVersionId,
    setAgentVersionId,

    // Execution config
    displayMode,
    setDisplayMode,
    showVariablePanel,
    setShowVariablePanel,
    variablesPanelStyle,
    setVariablesPanelStyle,
    autoRun,
    setAutoRun,
    allowChat,
    setAllowChat,
    hideReasoning,
    setHideReasoning,
    hideToolResults,
    setHideToolResults,

    // Variables
    agentVariableDefs,
    variableDefsForScopeMapping,
    defaultVariables,
    setDefaultVariables,
    scopeMappings,
    setScopeMappings,

    // Link existing
    filteredExisting,
    searchQuery,
    setSearchQuery,
    selectedExistingId,
    setSelectedExistingId,
    showOnlyUnlinked,
    setShowOnlyUnlinked,

    // JSON
    jsonDraft,
    setJsonDraft,
    jsonError,

    // Save
    isSaving,
    error,
    handlePrimary,
    primaryLabel,
    primaryDisabled,
    resetToDefaults,
    onClose,
  };
}

export type ShortcutQuickCreateState = ReturnType<
  typeof useShortcutQuickCreate
>;
