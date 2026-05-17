"use client";

/**
 * UnifiedAgentContextMenu — Full Diagnostic Lab
 *
 * Purpose: this page is a deliberately verbose harness for exercising
 * EVERY moving part of the v2 context menu. It is the most exhaustive
 * page in the testing suite — use it when "I should be seeing X and
 * I'm not." For multi-panel placement / context comparisons see the
 * Scenario Matrix at `/ssr/context-menu/scenarios`.
 *
 * What it exposes (left → right, top → bottom):
 *   • Identity banner — who is logged in, agent-context org / project / task,
 *     resolved scope ref. If user/org items aren't showing, this is the
 *     first place to look (RLS only returns rows that match the caller).
 *
 *   • Scope picker — re-fetches the unified menu under a different
 *     scope ref (global / user / organization / project / task). Adding
 *     a scopeId lets you scope to a specific id; otherwise we use the
 *     ids from agent-context where applicable.
 *
 *   • Surface picker — select a SurfaceManifest (matrx-user/notes,
 *     matrx-user/code, or none). The selection is passed verbatim to
 *     `<UnifiedAgentContextMenu surfaceName={...}>` and propagates to
 *     `runtime.surfaceName` on every shortcut launch. The launch thunk
 *     uses it to look up `agx_agent_surface.value_mappings` for
 *     (agentId, surfaceName, caller scope) and applies them via
 *     `mapScopeToInstanceWithSurface`. If no surface is selected, the
 *     legacy `scopeMappings` path runs.
 *
 *   • Live application-scope preview — exactly the object we'll send as
 *     `applicationScope` if you right-click and launch a shortcut. It
 *     updates as you select text, edit the contextData JSON, change the
 *     surface, etc. This is what gets handed to `mapScopeToInstance` /
 *     `mapScopeToInstanceWithSurface`.
 *
 *   • The right-click area — a textarea wired with `getTextarea` so the
 *     menu can capture selection ranges and replace/insert text. Use
 *     `placementMode` toggles to verify that hide / disable / show all
 *     do what they say. Switch between Dropdown trigger and right-click.
 *
 *   • API response (raw from /api/agent-context-menu) — exactly what the
 *     view returned for the current scope. The single most useful pane
 *     when "I should be seeing my user shortcut but I'm not."
 *
 *   • Redux state (post-reduce) — what the hook actually sees. Includes:
 *       - all shortcuts (with resolved scopeLevel)
 *       - all categories (with resolved scopeLevel)
 *       - all content blocks (with resolved scopeLevel)
 *       - scopeLoaded map (which scope refs have been hydrated)
 *       - status / error
 *
 *   • Hook output — the `categoryGroups` tree the menu actually renders
 *     from, with scope precedence + dedup applied.
 *
 *   • Surface registry — every SurfaceManifest currently registered in
 *     code, with its full `SurfaceValue` schema. Source of truth for
 *     what each surface promises to emit.
 *
 *   • Raw DB view query — runs the same view (`agx_context_menu_view`)
 *     directly through the supabase browser client, bypassing the API
 *     route. Compare against the API response to confirm RLS / scope
 *     filtering is consistent.
 *
 * Every panel is collapsed by default. Open only what you need; nothing
 * here re-fetches on render — the menu's lazy first-fetch only runs the
 * first time you engage the menu (right-click or icon).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ChevronDown,
  ChevronUp,
  Database,
  Loader2,
  RefreshCw,
  X,
} from "lucide-react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectUser,
  selectUserId,
  selectUserEmail,
  selectIsSuperAdmin,
} from "@/lib/redux/selectors/userSelectors";
import {
  selectAppContext,
  selectOrganizationId,
  selectOrganizationName,
  selectProjectId,
  selectProjectName,
  selectTaskId,
  selectTaskName,
} from "@/lib/redux/slices/appContextSlice";
import { selectAllShortcutsArray } from "@/features/agents/redux/agent-shortcuts/selectors";
import { selectAllCategoriesArray } from "@/features/agents/redux/agent-shortcut-categories/selectors";
import { selectAllContentBlocksArray } from "@/features/agents/redux/agent-content-blocks/selectors";
import { fetchUnifiedMenu } from "@/features/agents/redux/agent-shortcuts/thunks";
import { resolveRowScope } from "@/features/agents/redux/shared/scope";
import type { Scope, ScopeRef } from "@/features/agents/redux/shared/scope";
import { useUnifiedAgentContextMenu } from "@/features/context-menu-v2/hooks/useUnifiedAgentContextMenu";
import { getAllManifests } from "@/features/surfaces/manifests/registry";
import type { SurfaceManifest } from "@/features/surfaces/types";
import { supabase } from "@/utils/supabase/client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// Heavy: the v2 menu pulls in dropdown + context-menu + selection capture +
// floating icon. Keep the demo page's first paint tiny by lazy-loading it.
const UnifiedAgentContextMenu = dynamic(
  () =>
    import("@/features/context-menu-v2/UnifiedAgentContextMenu").then((m) => ({
      default: m.UnifiedAgentContextMenu,
    })),
  { ssr: false, loading: () => <PaneFallback /> },
);

// Heavy: CodeMirror + tree explorer + JSON tabs. Don't ship on first paint.
const JsonInspector = dynamic(
  () =>
    import("@/components/official-candidate/json-inspector/JsonInspector").then(
      (m) => ({ default: m.JsonInspector }),
    ),
  { ssr: false, loading: () => <PaneFallback /> },
);

function PaneFallback() {
  return (
    <div className="flex items-center justify-center p-4 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin mr-2" />
      Loading…
    </div>
  );
}

// ===========================================================================
// Collapsible panel
// ===========================================================================

interface PanelProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

function Panel({
  title,
  subtitle,
  defaultOpen = false,
  badge,
  children,
  className,
}: PanelProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div
      className={cn(
        "border border-border rounded-lg overflow-hidden bg-card",
        className,
      )}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-left">
          <span className="text-sm font-medium">{title}</span>
          {subtitle && (
            <span className="text-[11px] text-muted-foreground">
              {subtitle}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {badge}
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </button>
      {open && <div className="border-t border-border">{children}</div>}
    </div>
  );
}

// ===========================================================================
// Inspector panel — JSON inspector wrapped to match panel chrome
// ===========================================================================

function JsonPanel({
  title,
  subtitle,
  data,
  defaultOpen = false,
  badge,
  className,
}: {
  title: string;
  subtitle?: string;
  data: unknown;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  className?: string;
}) {
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      defaultOpen={defaultOpen}
      badge={badge}
      className={className}
    >
      <div className="h-[420px]">
        <JsonInspector data={data} />
      </div>
    </Panel>
  );
}

// ===========================================================================
// Identity banner — the "who am I and what's RLS seeing" panel
// ===========================================================================

function IdentityBanner({
  scopeRef,
  surfaceName,
}: {
  scopeRef: ScopeRef;
  surfaceName: string | null;
}) {
  const userId = useAppSelector(selectUserId);
  const userEmail = useAppSelector(selectUserEmail);
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const orgId = useAppSelector(selectOrganizationId);
  const orgName = useAppSelector(selectOrganizationName);
  const projectId = useAppSelector(selectProjectId);
  const projectName = useAppSelector(selectProjectName);
  const taskId = useAppSelector(selectTaskId);
  const taskName = useAppSelector(selectTaskName);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-[11px]">
      <Field
        label="User"
        value={userEmail ?? "(not signed in)"}
        mono={userId ?? "—"}
        accent={isSuperAdmin ? "super_admin" : undefined}
      />
      <Field
        label="Organization"
        value={orgName ?? "(none)"}
        mono={orgId ?? "—"}
      />
      <Field
        label="Project / Task"
        value={
          projectName
            ? taskName
              ? `${projectName} › ${taskName}`
              : projectName
            : "(none)"
        }
        mono={taskId ?? projectId ?? "—"}
      />
      <Field
        label="Scope being fetched"
        value={`${scopeRef.scope}${scopeRef.scopeId ? ` (${scopeRef.scopeId.slice(0, 8)}…)` : ""}`}
        mono={surfaceName ?? "no surface"}
        accent={surfaceName ? "surface" : undefined}
      />
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  accent,
}: {
  label: string;
  value: string;
  mono?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <div className="flex items-center gap-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {accent && (
          <span className="text-[9px] uppercase tracking-wide bg-primary/15 text-primary px-1 py-0.5 rounded">
            {accent}
          </span>
        )}
      </div>
      <div className="text-foreground truncate font-medium">{value}</div>
      {mono && (
        <div className="font-mono text-[10px] text-muted-foreground truncate">
          {mono}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Page
// ===========================================================================

const ALL_SCOPES: Scope[] = [
  "global",
  "user",
  "organization",
  "project",
  "task",
];

const PLACEMENT_KEYS = [
  "ai-action",
  "content-block",
  "organization-tool",
  "user-tool",
  "quick-action",
] as const;
type PlacementKey = (typeof PLACEMENT_KEYS)[number];

const DEFAULT_CONTEXT_DATA = `{
  "content": "Right-click here. The applicationScope sent to launchAgentExecution\\nwill include this 'content' key plus any 'selection' you make.",
  "context": "ssr-context-menu-demo"
}`;

export default function ContextMenuDemoPage() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const userId = useAppSelector(selectUserId);
  const orgId = useAppSelector(selectOrganizationId);
  const projectId = useAppSelector(selectProjectId);
  const taskId = useAppSelector(selectTaskId);
  const appContext = useAppSelector(selectAppContext);

  // -- Scope picker -------------------------------------------------------
  const [scope, setScope] = useState<Scope>("user");
  const [scopeIdOverride, setScopeIdOverride] = useState<string>("");

  // Auto-fill scopeId from appContext when the user picks a scope that maps
  // to a known id (so they don't have to paste it in by hand).
  const resolvedScopeId = useMemo<string | null>(() => {
    if (scopeIdOverride.trim().length > 0) return scopeIdOverride.trim();
    switch (scope) {
      case "user":
        return userId ?? null;
      case "organization":
        return orgId ?? null;
      case "project":
        return projectId ?? null;
      case "task":
        return taskId ?? null;
      case "global":
      default:
        return null;
    }
  }, [scope, scopeIdOverride, userId, orgId, projectId, taskId]);

  const scopeRef = useMemo<ScopeRef>(
    () => ({ scope, scopeId: resolvedScopeId }),
    [scope, resolvedScopeId],
  );

  // -- Surface picker -----------------------------------------------------
  const manifests = useMemo<SurfaceManifest[]>(
    () => getAllManifests().slice(),
    [],
  );
  const [surfaceName, setSurfaceName] = useState<string>("");
  const selectedManifest = useMemo<SurfaceManifest | undefined>(
    () => manifests.find((m) => m.surfaceName === surfaceName),
    [manifests, surfaceName],
  );

  // -- contextData editor ------------------------------------------------
  const [contextDataText, setContextDataText] = useState(DEFAULT_CONTEXT_DATA);
  const parsedContextData = useMemo<{
    parsed: Record<string, unknown> | null;
    error: string | null;
  }>(() => {
    try {
      const v = JSON.parse(contextDataText);
      if (v && typeof v === "object" && !Array.isArray(v)) {
        return { parsed: v as Record<string, unknown>, error: null };
      }
      return { parsed: null, error: "contextData must be a JSON object" };
    } catch (err) {
      return {
        parsed: null,
        error: err instanceof Error ? err.message : "Invalid JSON",
      };
    }
  }, [contextDataText]);

  // -- Placement mode toggles --------------------------------------------
  const [placementMode, setPlacementMode] = useState<
    Record<PlacementKey, "show" | "hide" | "disable">
  >({
    "ai-action": "show",
    "content-block": "show",
    "organization-tool": "show",
    "user-tool": "show",
    "quick-action": "show",
  });

  // -- Right-click textarea -----------------------------------------------
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [textareaValue, setTextareaValue] = useState(
    `Welcome to the context-menu diagnostic lab.

Right-click anywhere in this box. The menu will fetch under scope="${scope}" (with surface "${surfaceName || "none"}").

Select some text first to populate \`selection\`, \`text_before\`, and \`text_after\` in the live applicationScope below.`,
  );
  const [selectionText, setSelectionText] = useState("");
  const [selectionStart, setSelectionStart] = useState<number | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null);

  // Mirror the textarea's native selection so we can show the application
  // scope live before any right-click — gives Arman a continuous view of
  // what would be sent. We don't need DOM selection tracking here because
  // the menu has its own; this is purely for the preview pane.
  const refreshSelection = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setSelectionStart(start);
    setSelectionEnd(end);
    if (start !== end) {
      setSelectionText(el.value.slice(start, end));
    } else {
      setSelectionText("");
    }
  }, []);

  // -- Live applicationScope ---------------------------------------------
  const applicationScope = useMemo<Record<string, unknown>>(() => {
    const base: Record<string, unknown> = {
      ...(parsedContextData.parsed ?? {}),
    };
    if (selectionStart !== null && selectionEnd !== null) {
      const before = textareaValue.slice(0, selectionStart);
      const after = textareaValue.slice(selectionEnd);
      base.text_before = before;
      base.text_after = after;
      if (selectionText.length > 0) {
        base.selection = selectionText;
      }
    }
    return base;
  }, [
    parsedContextData.parsed,
    selectionStart,
    selectionEnd,
    selectionText,
    textareaValue,
  ]);

  // -- Menu hook (for the JSON inspectors — the menu component itself
  //    runs its own copy of this hook internally; we don't pass groups in).
  const hookOutput = useUnifiedAgentContextMenu({
    placementTypes: PLACEMENT_KEYS.filter(
      (p) => p !== "quick-action" && placementMode[p] !== "hide",
    ),
    enabled: true,
    scope,
    scopeId: resolvedScopeId,
  });

  // -- Redux mirrors for the inspectors -----------------------------------
  const allShortcuts = useAppSelector(selectAllShortcutsArray);
  const allCategories = useAppSelector(selectAllCategoriesArray);
  const allContentBlocks = useAppSelector(selectAllContentBlocksArray);
  const shortcutSlice = useAppSelector((s) => s.agentShortcut);

  const shortcutsWithScope = useMemo(() => {
    const placementByCategoryId = new Map(
      allCategories.map((c) => [c.id, c.placementType] as const),
    );
    return allShortcuts.map((s) => ({
      scope: resolveRowScope(s),
      id: s.id,
      label: s.label,
      agentId: s.agentId,
      userId: s.userId,
      organizationId: s.organizationId,
      projectId: s.projectId,
      taskId: s.taskId,
      categoryId: s.categoryId,
      // Placement is owned by the category, not the shortcut. Each shortcut
      // belongs to exactly one category, so it inherits exactly one placement.
      categoryPlacementType: placementByCategoryId.get(s.categoryId) ?? null,
      enabledFeatures: s.enabledFeatures,
      scopeMappings: s.scopeMappings ?? null,
      contextMappings: s.contextMappings ?? null,
      useLatest: s.useLatest,
      agentVersionId: s.agentVersionId,
      isActive: s.isActive,
    }));
  }, [allShortcuts, allCategories]);
  const categoriesWithScope = useMemo(
    () =>
      allCategories.map((c) => ({
        scope: resolveRowScope(c),
        id: c.id,
        label: c.label,
        placementType: c.placementType,
        parentCategoryId: c.parentCategoryId,
        userId: c.userId,
        organizationId: c.organizationId,
        projectId: c.projectId,
        taskId: c.taskId,
        isActive: c.isActive,
        enabledFeatures: c.enabledFeatures,
      })),
    [allCategories],
  );
  const blocksWithScope = useMemo(
    () =>
      allContentBlocks.map((b) => ({
        scope: resolveRowScope(b),
        id: b.id,
        label: b.label,
        blockId: b.blockId,
        categoryId: b.categoryId,
        userId: b.userId,
        organizationId: b.organizationId,
        projectId: b.projectId,
        taskId: b.taskId,
        isActive: b.isActive,
      })),
    [allContentBlocks],
  );

  // -- API response capture (mirrors what the thunk receives) -------------
  type ApiResponse = {
    fetchedAt: string;
    scopeRef: ScopeRef;
    status: number;
    ok: boolean;
    body: unknown;
  };
  const [apiResponse, setApiResponse] = useState<ApiResponse | null>(null);
  const [apiBusy, setApiBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const fetchApi = useCallback(async () => {
    setApiBusy(true);
    setApiError(null);
    try {
      const qs = new URLSearchParams();
      qs.set("scope", scopeRef.scope);
      if (scopeRef.scopeId) qs.set("scopeId", scopeRef.scopeId);
      const res = await fetch(`/api/agent-context-menu?${qs.toString()}`, {
        method: "GET",
        credentials: "include",
      });
      const body = await res.json().catch(() => null);
      setApiResponse({
        fetchedAt: new Date().toISOString(),
        scopeRef,
        status: res.status,
        ok: res.ok,
        body,
      });
    } catch (err) {
      setApiError(err instanceof Error ? err.message : "Fetch failed");
    } finally {
      setApiBusy(false);
    }
  }, [scopeRef]);

  // -- Raw DB view query (bypass /api/agent-context-menu) -----------------
  type DbResponse = {
    fetchedAt: string;
    rowCount: number;
    rows: unknown;
    error: string | null;
  };
  const [dbResponse, setDbResponse] = useState<DbResponse | null>(null);
  const [dbBusy, setDbBusy] = useState(false);

  const fetchDbView = useCallback(async () => {
    setDbBusy(true);
    try {
      // Cast through `any` — the generated Database type doesn't expose
      // `agx_context_menu_view` as a queryable surface. The view is real
      // and RLS-enforced; we just need a tolerant type here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      const { data, error } = await client
        .from("agx_context_menu_view")
        .select("*");
      setDbResponse({
        fetchedAt: new Date().toISOString(),
        rowCount: Array.isArray(data) ? data.length : 0,
        rows: data,
        error: error?.message ?? null,
      });
    } catch (err) {
      setDbResponse({
        fetchedAt: new Date().toISOString(),
        rowCount: 0,
        rows: null,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setDbBusy(false);
    }
  }, []);

  // -- Triggering the menu's own refresh (force=true to bust the cache) ---
  const refreshMenu = useCallback(async () => {
    await dispatch(
      fetchUnifiedMenu({
        scope: scopeRef.scope,
        scopeId: scopeRef.scopeId,
        force: true,
      }),
    ).unwrap();
  }, [dispatch, scopeRef]);

  // First-paint sanity fetch — exactly one call so the inspectors aren't
  // empty. Subsequent scope changes are user-initiated via the Refresh
  // button, mirroring how the real menu works (lazy).
  const didInitRef = useRef(false);
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    void fetchApi();
  }, [fetchApi]);

  // -- Toggle helpers ------------------------------------------------------
  const cyclePlacement = useCallback((key: PlacementKey) => {
    setPlacementMode((prev) => {
      const cur = prev[key];
      const next =
        cur === "show" ? "hide" : cur === "hide" ? "disable" : "show";
      return { ...prev, [key]: next };
    });
  }, []);

  // -- Per-source/per-scope launch indicator ------------------------------
  const launchCountRef = useRef(0);
  const [lastLaunch, setLastLaunch] = useState<{
    at: string;
    note: string;
  } | null>(null);

  // We can't intercept launchAgentExecution from here, but we can read the
  // active-requests slice to surface "something just launched."
  const activeRequests = useAppSelector((s) => s.activeRequests);
  useEffect(() => {
    const count = Object.keys(activeRequests?.byConversationId ?? {}).length;
    if (count > launchCountRef.current) {
      launchCountRef.current = count;
      setLastLaunch({
        at: new Date().toISOString(),
        note: `active requests: ${count}`,
      });
    } else {
      launchCountRef.current = count;
    }
  }, [activeRequests]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* ── Action toolbar + identity ─────────────────────────────── */}
      <div className="border-b border-border bg-card/50 backdrop-blur px-3 py-1.5 flex items-center justify-between gap-3 flex-shrink-0">
        <p className="text-[11px] text-muted-foreground truncate hidden md:block">
          Right-click the trigger; every fetched/derived value lands in the
          inspectors. Nothing re-fetches on render — use the buttons.
        </p>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchApi()}
            disabled={apiBusy}
            className="h-7 text-xs"
          >
            {apiBusy ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1.5" />
            )}
            Refetch API
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refreshMenu()}
            className="h-7 text-xs"
          >
            <RefreshCw className="h-3 w-3 mr-1.5" />
            Refresh menu (force)
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void fetchDbView()}
            disabled={dbBusy}
            className="h-7 text-xs"
          >
            {dbBusy ? (
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
            ) : (
              <Database className="h-3 w-3 mr-1.5" />
            )}
            Query view
          </Button>
        </div>
      </div>

      {/* ── Identity banner ─────────────────────────────────────────── */}
      <div className="border-b border-border px-3 py-2 flex-shrink-0">
        <IdentityBanner scopeRef={scopeRef} surfaceName={surfaceName || null} />
      </div>

      {/* ── Body: 2 columns on desktop ──────────────────────────────── */}
      <div className="flex-1 overflow-auto p-3">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          {/* ── LEFT: trigger + config (3 cols) ───────────────────── */}
          <div className="lg:col-span-3 space-y-3 min-w-0">
            {/* Scenario controls */}
            <div className="border border-border rounded-lg bg-card p-3 space-y-3">
              <div className="text-xs font-medium">Scenario controls</div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {/* Scope selector */}
                <div className="space-y-1">
                  <Label className="text-[11px]">Scope</Label>
                  <Select
                    value={scope}
                    onValueChange={(v) => setScope(v as Scope)}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALL_SCOPES.map((s) => (
                        <SelectItem key={s} value={s} className="text-xs">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 md:col-span-2">
                  <Label className="text-[11px]">
                    Scope id{" "}
                    <span className="text-muted-foreground font-normal">
                      (override; defaults to agent-context where applicable)
                    </span>
                  </Label>
                  <div className="flex gap-1">
                    <Input
                      value={scopeIdOverride}
                      onChange={(e) => setScopeIdOverride(e.target.value)}
                      placeholder={resolvedScopeId ?? "—"}
                      className="h-8 text-xs font-mono"
                    />
                    {scopeIdOverride && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setScopeIdOverride("")}
                        className="h-8 px-2"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Surface selector */}
              <div className="space-y-1">
                <Label className="text-[11px]">
                  Surface name{" "}
                  <span className="text-muted-foreground font-normal">
                    (passes through to runtime.surfaceName on every launch)
                  </span>
                </Label>
                <Select
                  value={surfaceName || "__none__"}
                  onValueChange={(v) =>
                    setSurfaceName(v === "__none__" ? "" : v)
                  }
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__" className="text-xs">
                      — none (legacy scopeMappings only) —
                    </SelectItem>
                    {manifests.map((m) => (
                      <SelectItem
                        key={m.surfaceName}
                        value={m.surfaceName}
                        className="text-xs"
                      >
                        {m.surfaceName}{" "}
                        <span className="text-muted-foreground">
                          ({m.values.length} values)
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Placement mode toggles */}
              <div className="space-y-1">
                <Label className="text-[11px]">Placement modes</Label>
                <div className="flex flex-wrap gap-1.5">
                  {PLACEMENT_KEYS.map((key) => (
                    <button
                      key={key}
                      onClick={() => cyclePlacement(key)}
                      className={cn(
                        "text-[10px] font-mono px-2 py-1 rounded border",
                        placementMode[key] === "show" &&
                          "bg-primary/10 border-primary/30 text-primary",
                        placementMode[key] === "hide" &&
                          "bg-muted border-border text-muted-foreground line-through",
                        placementMode[key] === "disable" &&
                          "bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-300",
                      )}
                    >
                      {key} = {placementMode[key]}
                    </button>
                  ))}
                </div>
              </div>

              {/* contextData JSON */}
              <div className="space-y-1">
                <Label className="text-[11px]">
                  contextData{" "}
                  <span className="text-muted-foreground font-normal">
                    (merged with selection / text_before / text_after into the
                    applicationScope sent at launch)
                  </span>
                </Label>
                <textarea
                  value={contextDataText}
                  onChange={(e) => setContextDataText(e.target.value)}
                  className={cn(
                    "w-full text-[11px] font-mono p-2 rounded border bg-muted/30 outline-none focus:ring-2 focus:ring-primary min-h-[100px]",
                    parsedContextData.error
                      ? "border-destructive"
                      : "border-border",
                  )}
                  spellCheck={false}
                />
                {parsedContextData.error && (
                  <div className="text-[10px] text-destructive">
                    {parsedContextData.error}
                  </div>
                )}
              </div>
            </div>

            {/* Right-click area */}
            <div className="border border-border rounded-lg bg-card p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-medium">
                  Right-click here
                  <span className="ml-2 text-[10px] text-muted-foreground">
                    sourceFeature=&quot;demo&quot; · scope=&quot;{scope}&quot;
                  </span>
                </div>
                {lastLaunch && (
                  <div className="text-[10px] text-muted-foreground">
                    Last launch detected:{" "}
                    {lastLaunch.at.split("T")[1]?.split(".")[0]} ·{" "}
                    {lastLaunch.note}
                  </div>
                )}
              </div>

              <UnifiedAgentContextMenu
                sourceFeature="demo"
                surfaceName={surfaceName || undefined}
                getTextarea={() => textareaRef.current}
                onTextReplace={(v) => setTextareaValue(v)}
                onTextInsertBefore={(t) => setTextareaValue(t + textareaValue)}
                onTextInsertAfter={(t) => setTextareaValue(textareaValue + t)}
                onContentInserted={refreshSelection}
                isEditable
                placementMode={placementMode}
                contextData={parsedContextData.parsed ?? undefined}
                scope={scope}
                scopeId={resolvedScopeId}
              >
                <textarea
                  ref={textareaRef}
                  value={textareaValue}
                  onChange={(e) => setTextareaValue(e.target.value)}
                  onSelect={refreshSelection}
                  onMouseUp={refreshSelection}
                  onKeyUp={refreshSelection}
                  className="w-full min-h-[260px] rounded-md border border-border bg-background p-3 text-[16px] outline-none focus:ring-2 focus:ring-primary"
                  spellCheck={false}
                />
              </UnifiedAgentContextMenu>
            </div>

            {/* Live application scope preview */}
            <Panel
              title="applicationScope (live)"
              subtitle="what gets sent on launch"
              defaultOpen
              badge={
                <span className="text-[10px] font-mono text-muted-foreground">
                  {Object.keys(applicationScope).length} keys
                </span>
              }
            >
              <div className="h-[260px]">
                <JsonInspector data={applicationScope} />
              </div>
            </Panel>

            {/* Selection state */}
            <Panel
              title="Selection state"
              defaultOpen={false}
              badge={
                <span className="text-[10px] font-mono text-muted-foreground">
                  {selectionStart !== null && selectionEnd !== null
                    ? `${selectionStart}–${selectionEnd}`
                    : "none"}
                </span>
              }
            >
              <div className="p-3 text-[11px] space-y-1">
                <div>
                  <span className="text-muted-foreground">range: </span>
                  <span className="font-mono">
                    {selectionStart !== null && selectionEnd !== null
                      ? `[${selectionStart}, ${selectionEnd}]`
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">selection: </span>
                  <span className="font-mono">
                    {selectionText
                      ? `"${selectionText.slice(0, 100)}${selectionText.length > 100 ? "…" : ""}"`
                      : "—"}
                  </span>
                </div>
              </div>
            </Panel>
          </div>

          {/* ── RIGHT: inspectors (2 cols) ────────────────────────── */}
          <div className="lg:col-span-2 space-y-3 min-w-0">
            <JsonPanel
              title="API response"
              subtitle={
                apiResponse
                  ? `/api/agent-context-menu — status ${apiResponse.status}`
                  : "not fetched yet"
              }
              defaultOpen
              badge={
                apiError ? (
                  <span className="text-[10px] text-destructive">
                    {apiError}
                  </span>
                ) : apiResponse ? (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {apiResponse.fetchedAt.split("T")[1]?.split(".")[0]}
                  </span>
                ) : null
              }
              data={apiResponse ?? { hint: "Click 'Refetch API' to populate" }}
            />

            <JsonPanel
              title="Hook output (categoryGroups)"
              subtitle="what UnifiedAgentContextMenu actually renders from"
              badge={
                hookOutput.loading ? (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {hookOutput.categoryGroups.length} root cats
                  </span>
                )
              }
              data={{
                loading: hookOutput.loading,
                error: hookOutput.error,
                categoryGroups: hookOutput.categoryGroups,
              }}
            />

            <JsonPanel
              title="Redux: shortcuts"
              subtitle="state.agentShortcut.shortcuts (with resolved scope)"
              badge={
                <span className="text-[10px] font-mono text-muted-foreground">
                  {shortcutsWithScope.length} rows
                </span>
              }
              data={shortcutsWithScope}
            />

            <JsonPanel
              title="Redux: categories"
              subtitle="with resolved scope"
              badge={
                <span className="text-[10px] font-mono text-muted-foreground">
                  {categoriesWithScope.length} rows
                </span>
              }
              data={categoriesWithScope}
            />

            <JsonPanel
              title="Redux: content blocks"
              subtitle="with resolved scope"
              badge={
                <span className="text-[10px] font-mono text-muted-foreground">
                  {blocksWithScope.length} rows
                </span>
              }
              data={blocksWithScope}
            />

            <JsonPanel
              title="Redux: shortcut slice meta"
              subtitle="scopeLoaded / status / error"
              data={{
                status: shortcutSlice?.status ?? null,
                error: shortcutSlice?.error ?? null,
                scopeLoaded: shortcutSlice?.scopeLoaded ?? {},
                activeShortcutId: shortcutSlice?.activeShortcutId ?? null,
              }}
            />

            <JsonPanel
              title="Surface registry"
              subtitle="all registered SurfaceManifests"
              badge={
                <span className="text-[10px] font-mono text-muted-foreground">
                  {manifests.length} manifests
                </span>
              }
              data={manifests}
            />

            {selectedManifest && (
              <JsonPanel
                title={`Selected surface: ${selectedManifest.surfaceName}`}
                subtitle="will be sent as runtime.surfaceName"
                defaultOpen
                data={selectedManifest}
              />
            )}

            <JsonPanel
              title="Raw DB view"
              subtitle="agx_context_menu_view via supabase-js (RLS still applies)"
              badge={
                dbResponse ? (
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {dbResponse.rowCount} rows
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    click query
                  </span>
                )
              }
              data={
                dbResponse ?? {
                  hint: "Click 'Query view' to run a raw select on agx_context_menu_view",
                }
              }
            />

            <JsonPanel
              title="App context"
              subtitle="state.appContext — feeds default scopeId"
              data={appContext}
            />

            <JsonPanel
              title="Current user"
              subtitle="state.userAuth + userProfile (sanitized)"
              data={{
                id: user?.id ?? null,
                email: user?.email ?? null,
                isAdmin: user?.isAdmin ?? false,
                adminLevel: user?.adminLevel ?? null,
                authReady: user?.authReady ?? false,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
