"use client";

/**
 * ConversationSourceFilterTree — the canonical "show me which surfaces"
 * control for any conversation-history scope.
 *
 * Renders a popover with an App -> (group) -> Feature checkbox tree built from
 * the live `get_cx_conversation_source_facets` data (real values + counts)
 * merged with the static source-registry metadata (labels, icons, grouping).
 *
 * SELECTION MODEL — allow-list at the FEATURE level:
 *  - Checking features filters the scope to those `source_feature` values.
 *  - The empty/"Generic" node maps to `includeEmptySource`.
 *  - App / group checkboxes are convenience toggles whose state is DERIVED
 *    (checked / indeterminate / empty) from their descendant feature leaves.
 *  - NOTHING checked = no filter = show everything (the browse-all state).
 *
 * On change it both persists the filter to the scope (`setScopeSourceFilter`,
 * which invalidates the page window) and re-fetches the first page, so the
 * host list just renders `scope.items`.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ChevronDown,
  ChevronRight,
  ListFilter,
  Minus,
  RotateCcw,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  fetchConversationHistory,
  fetchSourceFacets,
} from "@/features/agents/redux/conversation-history/thunks";
import { setScopeSourceFilter } from "@/features/agents/redux/conversation-history/slice";
import {
  makeSelectConversationHistoryScope,
  selectSourceFacets,
  selectSourceFacetsStatus,
} from "@/features/agents/redux/conversation-history/selectors";
import {
  EMPTY_SOURCE_KEY,
  FEATURE_GROUPS,
  appMeta,
  featureMeta,
  getSurfaceDefault,
  groupIdForFeature,
  sourceKey,
  type SurfaceFilterPref,
} from "@/features/agents/redux/conversation-history/source-registry";
import type { SourceFacet } from "@/features/agents/redux/conversation-history/types";

// ── Tree model ───────────────────────────────────────────────────────────────

interface FeatureNode {
  key: string;
  label: string;
  icon: LucideIcon;
  count: number;
  system: boolean;
}

interface GroupNode {
  id: string;
  label: string;
  icon: LucideIcon;
  count: number;
  features: FeatureNode[];
}

interface AppNode {
  key: string;
  label: string;
  icon: LucideIcon;
  count: number;
  groups: GroupNode[];
  /** Features directly under the app (not in a multi-member group). */
  features: FeatureNode[];
}

/** Builds the App -> group/feature tree from the user's source facets. */
function buildSourceTree(facets: SourceFacet[]): AppNode[] {
  const apps = new Map<
    string,
    { count: number; features: Map<string, number> }
  >();
  for (const f of facets) {
    const appKey = sourceKey(f.sourceApp);
    const featureKey = sourceKey(f.sourceFeature);
    let app = apps.get(appKey);
    if (!app) {
      app = { count: 0, features: new Map() };
      apps.set(appKey, app);
    }
    app.count += f.count;
    app.features.set(featureKey, (app.features.get(featureKey) ?? 0) + f.count);
  }

  const result: AppNode[] = [];
  for (const [appKey, app] of apps) {
    const meta = appMeta(appKey);
    const grouped = new Map<string, FeatureNode[]>();
    const ungrouped: FeatureNode[] = [];

    for (const [featureKey, count] of app.features) {
      const fmeta = featureMeta(featureKey);
      const node: FeatureNode = {
        key: featureKey,
        label: fmeta.label,
        icon: fmeta.icon,
        count,
        system: !!fmeta.system,
      };
      const gid = groupIdForFeature(featureKey);
      if (gid) {
        const arr = grouped.get(gid);
        if (arr) arr.push(node);
        else grouped.set(gid, [node]);
      } else {
        ungrouped.push(node);
      }
    }

    const groups: GroupNode[] = [];
    for (const fg of FEATURE_GROUPS) {
      const nodes = grouped.get(fg.id);
      if (!nodes || nodes.length === 0) continue;
      // A single-member group is just noise — render it inline instead.
      if (nodes.length === 1) {
        ungrouped.push(nodes[0]);
        continue;
      }
      groups.push({
        id: fg.id,
        label: fg.label,
        icon: fg.icon,
        count: nodes.reduce((s, n) => s + n.count, 0),
        features: nodes.sort((a, b) => b.count - a.count),
      });
    }

    ungrouped.sort((a, b) => b.count - a.count);
    groups.sort((a, b) => b.count - a.count);
    result.push({
      key: appKey,
      label: meta.label,
      icon: meta.icon,
      count: app.count,
      groups,
      features: ungrouped,
    });
  }

  result.sort((a, b) => b.count - a.count);
  return result;
}

/** All feature keys present in an app node (groups + ungrouped). */
function appFeatureKeys(app: AppNode): string[] {
  const keys: string[] = [];
  for (const g of app.groups) for (const f of g.features) keys.push(f.key);
  for (const f of app.features) keys.push(f.key);
  return keys;
}

// ── Tri-state ────────────────────────────────────────────────────────────────

type TriState = "checked" | "indeterminate" | "empty";

function triFor(keys: string[], selected: Set<string>): TriState {
  if (keys.length === 0) return "empty";
  let on = 0;
  for (const k of keys) if (selected.has(k)) on++;
  if (on === 0) return "empty";
  if (on === keys.length) return "checked";
  return "indeterminate";
}

// ── Component ──────────────────────────────────────────────────────────────

export interface ConversationSourceFilterTreeProps {
  /** Conversation-history scope this filter drives. */
  scopeId: string;
  /** Surface id for "Reset to defaults" (e.g. "chat", "code"). */
  surfaceId: string;
  /** Trigger presentation. Default "icon" (quiet) — use "button" for windows. */
  triggerVariant?: "icon" | "button";
  triggerClassName?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
}

export const ConversationSourceFilterTree: React.FC<
  ConversationSourceFilterTreeProps
> = ({
  scopeId,
  surfaceId,
  triggerVariant = "icon",
  triggerClassName,
  align = "start",
  side = "bottom",
}) => {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);

  const selectScope = useMemo(
    () => makeSelectConversationHistoryScope(scopeId),
    [scopeId],
  );
  const scope = useAppSelector(selectScope);
  const facets = useAppSelector(selectSourceFacets);
  const facetsStatus = useAppSelector(selectSourceFacetsStatus);

  // Load facets once (cached on the slice root with a TTL).
  useEffect(() => {
    void dispatch(fetchSourceFacets(undefined));
  }, [dispatch]);

  const tree = useMemo(() => buildSourceTree(facets), [facets]);

  // Effective selection: feature allow-list + empty flag, expanding any
  // whole-app selections (includeSourceApps) into their known feature keys so
  // the checkbox visuals stay consistent. The tree itself commits at the
  // feature level (includeSourceApps: []).
  const { selectedFeatures, emptySelected } = useMemo(() => {
    const selected = new Set(scope.includeSourceFeatures);
    if (scope.includeSourceApps.length > 0) {
      const apps = new Set(scope.includeSourceApps);
      for (const app of tree) {
        if (apps.has(app.key)) {
          for (const k of appFeatureKeys(app)) selected.add(k);
        }
      }
    }
    return {
      selectedFeatures: selected,
      emptySelected: scope.includeEmptySource,
    };
  }, [
    scope.includeSourceFeatures,
    scope.includeSourceApps,
    scope.includeEmptySource,
    tree,
  ]);

  const activeCount = selectedFeatures.size + (emptySelected ? 1 : 0);

  // Commit a new selection → persist + refetch first page.
  const commit = useCallback(
    (nextFeatures: Set<string>, nextEmpty: boolean) => {
      const includeSourceFeatures = Array.from(nextFeatures);
      dispatch(
        setScopeSourceFilter({
          scopeId,
          includeSourceFeatures,
          includeSourceApps: [],
          includeEmptySource: nextEmpty,
        }),
      );
      void dispatch(fetchConversationHistory({ scopeId, replace: true }));
    },
    [dispatch, scopeId],
  );

  const toggleFeature = useCallback(
    (featureKey: string) => {
      if (featureKey === EMPTY_SOURCE_KEY) {
        commit(new Set(selectedFeatures), !emptySelected);
        return;
      }
      const next = new Set(selectedFeatures);
      if (next.has(featureKey)) next.delete(featureKey);
      else next.add(featureKey);
      commit(next, emptySelected);
    },
    [commit, selectedFeatures, emptySelected],
  );

  const toggleKeys = useCallback(
    (keys: string[]) => {
      const tri = triFor(keys, selectedFeatures);
      const next = new Set(selectedFeatures);
      let nextEmpty = emptySelected;
      const turnOn = tri !== "checked"; // empty/indeterminate → select all
      for (const k of keys) {
        if (k === EMPTY_SOURCE_KEY) {
          nextEmpty = turnOn;
          continue;
        }
        if (turnOn) next.add(k);
        else next.delete(k);
      }
      commit(next, nextEmpty);
    },
    [commit, selectedFeatures, emptySelected],
  );

  const clearAll = useCallback(() => commit(new Set(), false), [commit]);

  const resetToDefaults = useCallback(() => {
    const def: SurfaceFilterPref = getSurfaceDefault(surfaceId);
    dispatch(
      setScopeSourceFilter({
        scopeId,
        includeSourceFeatures: def.includeFeatures,
        includeSourceApps: def.includeApps,
        includeEmptySource: def.includeEmptySource,
      }),
    );
    void dispatch(fetchConversationHistory({ scopeId, replace: true }));
  }, [dispatch, scopeId, surfaceId]);

  const isFeatureChecked = useCallback(
    (key: string): boolean =>
      key === EMPTY_SOURCE_KEY ? emptySelected : selectedFeatures.has(key),
    [emptySelected, selectedFeatures],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {triggerVariant === "button" ? (
          <button
            type="button"
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
              activeCount > 0 && "text-primary",
              triggerClassName,
            )}
            aria-label="Filter conversations by source"
            title="Filter by app and feature"
          >
            <ListFilter className="h-3.5 w-3.5" />
            Filter
            {activeCount > 0 && (
              <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-semibold tabular-nums text-primary-foreground">
                {activeCount}
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            className={cn(
              "relative inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
              activeCount > 0 && "text-primary",
              triggerClassName,
            )}
            aria-label="Filter conversations by source"
            title="Filter by app and feature"
          >
            <ListFilter className="h-3.5 w-3.5" />
            {activeCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 inline-flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[8px] font-semibold tabular-nums text-primary-foreground">
                {activeCount}
              </span>
            )}
          </button>
        )}
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={6}
        className="w-72 overflow-hidden p-0"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Show conversations from
          </span>
          <button
            type="button"
            onClick={resetToDefaults}
            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            title="Reset to this surface's defaults"
          >
            <RotateCcw className="h-3 w-3" />
            Defaults
          </button>
        </div>

        <div className="max-h-[min(60dvh,420px)] overflow-y-auto py-1">
          {facetsStatus === "loading" && tree.length === 0 && (
            <div className="px-3 py-3 text-[11px] text-muted-foreground">
              Loading sources…
            </div>
          )}
          {facetsStatus !== "loading" && tree.length === 0 && (
            <div className="px-3 py-3 text-[11px] text-muted-foreground">
              No conversations to filter yet.
            </div>
          )}

          {tree.map((app) => (
            <AppRow
              key={app.key}
              app={app}
              selectedFeatures={selectedFeatures}
              isFeatureChecked={isFeatureChecked}
              onToggleFeature={toggleFeature}
              onToggleKeys={toggleKeys}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <span className="text-[10px] text-muted-foreground">
            {activeCount === 0
              ? "Showing everything"
              : `${activeCount} source${activeCount === 1 ? "" : "s"} selected`}
          </span>
          <button
            type="button"
            onClick={clearAll}
            disabled={activeCount === 0}
            className="text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            Show all
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// ── Rows ─────────────────────────────────────────────────────────────────────

interface TriCheckboxProps {
  state: TriState;
  onClick: () => void;
  label: string;
}

const TriCheckbox: React.FC<TriCheckboxProps> = ({ state, onClick, label }) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={
      state === "checked" ? true : state === "indeterminate" ? "mixed" : false
    }
    aria-label={label}
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    className={cn(
      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border transition-colors",
      state === "empty"
        ? "border-muted-foreground/40"
        : "border-primary bg-primary text-primary-foreground",
    )}
  >
    {state === "checked" && <CheckMark />}
    {state === "indeterminate" && <Minus className="h-2.5 w-2.5" />}
  </button>
);

const CheckMark: React.FC = () => (
  <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" aria-hidden>
    <path
      d="M2.5 6.5L5 9L9.5 3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface AppRowProps {
  app: AppNode;
  selectedFeatures: Set<string>;
  isFeatureChecked: (key: string) => boolean;
  onToggleFeature: (key: string) => void;
  onToggleKeys: (keys: string[]) => void;
}

const AppRow: React.FC<AppRowProps> = ({
  app,
  selectedFeatures,
  isFeatureChecked,
  onToggleFeature,
  onToggleKeys,
}) => {
  const [open, setOpen] = useState(true);
  const keys = useMemo(() => appFeatureKeys(app), [app]);
  const tri = triFor(keys, selectedFeatures);
  const AppIcon = app.icon;

  return (
    <div className="px-1">
      <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-accent/50">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-4 w-4 items-center justify-center text-muted-foreground"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        <TriCheckbox
          state={tri}
          onClick={() => onToggleKeys(keys)}
          label={`All ${app.label}`}
        />
        <AppIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {app.label}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {app.count}
        </span>
      </div>

      {open && (
        <div className="ml-5 border-l border-border/60 pl-1.5">
          {app.groups.map((group) => (
            <GroupRow
              key={group.id}
              group={group}
              selectedFeatures={selectedFeatures}
              isFeatureChecked={isFeatureChecked}
              onToggleFeature={onToggleFeature}
              onToggleKeys={onToggleKeys}
            />
          ))}
          {app.features.map((feature) => (
            <FeatureRow
              key={feature.key}
              feature={feature}
              checked={isFeatureChecked(feature.key)}
              onToggle={() => onToggleFeature(feature.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface GroupRowProps {
  group: GroupNode;
  selectedFeatures: Set<string>;
  isFeatureChecked: (key: string) => boolean;
  onToggleFeature: (key: string) => void;
  onToggleKeys: (keys: string[]) => void;
}

const GroupRow: React.FC<GroupRowProps> = ({
  group,
  selectedFeatures,
  isFeatureChecked,
  onToggleFeature,
  onToggleKeys,
}) => {
  const [open, setOpen] = useState(false);
  const keys = useMemo(() => group.features.map((f) => f.key), [group]);
  const tri = triFor(keys, selectedFeatures);
  const GroupIcon = group.icon;

  return (
    <div>
      <div className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-accent/50">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex h-4 w-4 items-center justify-center text-muted-foreground"
          aria-label={open ? "Collapse" : "Expand"}
        >
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </button>
        <TriCheckbox
          state={tri}
          onClick={() => onToggleKeys(keys)}
          label={`All ${group.label}`}
        />
        <GroupIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
          {group.label}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
          {group.count}
        </span>
      </div>
      {open && (
        <div className="ml-5 border-l border-border/60 pl-1.5">
          {group.features.map((feature) => (
            <FeatureRow
              key={feature.key}
              feature={feature}
              checked={isFeatureChecked(feature.key)}
              onToggle={() => onToggleFeature(feature.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface FeatureRowProps {
  feature: FeatureNode;
  checked: boolean;
  onToggle: () => void;
}

const FeatureRow: React.FC<FeatureRowProps> = ({
  feature,
  checked,
  onToggle,
}) => {
  const FeatureIcon = feature.icon;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left hover:bg-accent/50"
    >
      <span className="w-4" aria-hidden />
      <TriCheckbox
        state={checked ? "checked" : "empty"}
        onClick={onToggle}
        label={feature.label}
      />
      <FeatureIcon
        className={cn(
          "h-3.5 w-3.5 shrink-0",
          feature.system ? "text-muted-foreground/60" : "text-muted-foreground",
        )}
      />
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-[11px]",
          feature.system ? "text-muted-foreground" : "text-foreground",
        )}
      >
        {feature.label}
      </span>
      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
        {feature.count}
      </span>
    </button>
  );
};

export default ConversationSourceFilterTree;
