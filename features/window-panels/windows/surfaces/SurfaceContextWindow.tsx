"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useEffect, useState } from "react";
import {
  Braces,
  Check,
  CircleDot,
  Copy,
  Crosshair,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@ai-matrx/design-system/controls";
import { CopyForAiButton } from "@/components/agent-copy/CopyForAiButton";
import { CopyForAiIcon } from "@/components/agent-copy/CopyForAiIcon";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import type { ContextMenuExtraItem, ContextMenuExtraSection } from "@/features/context-menu-v3/types";
import { getManifest } from "@/features/surfaces/manifests/registry";
import { getSurfaceDisplayLabel } from "@ai-matrx/chat/surfaces/utils/surface-display";
import { surfaceLevelPlace } from "@ai-matrx/chat/agents/redux/execution-system/context-rules/context-hierarchy";
import { useLiveSurfaceScope } from "@ai-matrx/chat/surfaces/runtime/useLiveSurfaceScope";
import { useAvailableHere } from "@ai-matrx/chat/surfaces/runtime/available-here";
import { locateSurfaceValueOnPage } from "@ai-matrx/chat/surfaces/utils/locate-on-page";
import { listLiveWriteTargets } from "@ai-matrx/chat/surfaces/runtime/surface-writeback";
import type { ResolvedSurfaceValue } from "@ai-matrx/chat/surfaces/types";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { ReadFailure } from "@ai-matrx/design-system";
import { InfoHint } from "@/components/official/InfoHint";
import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { ContextRulesTable, type ContextHierarchy } from "@ai-matrx/agents/context/react";
import { CONTEXT_RULES_FEATURE, DEFAULT_INLINE_CAP } from "@ai-matrx/agents/context";
import { ensureSurfaceFeatureLoaded } from "@ai-matrx/chat/surfaces/redux/userStateSlice";
import {
  saveContextRule,
  saveContextRules,
  selectSavedContextRuleRows,
} from "@ai-matrx/chat/agents/redux/execution-system/context-rules/context-rules.thunks";
import { surfaceContextRows } from "@ai-matrx/chat/agents/redux/execution-system/context-rules/surface-context-rows";
import { contextRowPlacer } from "@ai-matrx/chat/agents/redux/execution-system/context-rules/context-hierarchy";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";

export interface SurfaceContextWindowProps {
  isOpen: boolean;
  onClose: () => void;
  surfaceName: string;
  isEditable?: boolean;
}

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

/**
 * Present but empty (`[]`, `{}`, `""`, `null`). A surface emits these on
 * purpose to say "loaded, and there is nothing" — which must never read as
 * "not supplied" (an omitted key, i.e. `undefined`). A nullable value such as
 * "no preselected organization chosen" is `null` by contract (page-pass rule: not
 * loaded → omit the key). They COUNT as supplied (the page answered — with
 * nothing), and the footer names how many of the supplied values are empty:
 * "53/63 supplied (32 empty)". Counting them as missing read "21/63 supplied"
 * on a CRM record where 53 were supplied (page-pass 2026-09-28).
 */
function isPresentEmpty(value: unknown): boolean {
  return value !== undefined && !hasValue(value);
}

function displayValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return "[Value cannot be serialized]";
    }
  }
  return String(value);
}

type ContextItem =
  | { key: string; kind: "declared"; declaration: ResolvedSurfaceValue }
  | { key: string; kind: "runtime"; declaration: null };


function statusPresentation(
  status: ReturnType<typeof useLiveSurfaceScope>["status"],
) {
  if (status === "live") {
    return {
      label: "Live",
      className: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
    };
  }
  if (status === "snapshot") {
    return {
      label: "Snapshot",
      className: "border-amber-500/40 text-amber-600 dark:text-amber-400",
    };
  }
  if (status === "error") {
    return {
      label: "Runtime error",
      className: "border-destructive/40 text-destructive",
    };
  }
  return { label: "No runtime", className: "text-muted-foreground" };
}

export default function SurfaceContextWindow({
  isOpen,
  onClose,
  surfaceName,
  isEditable = false,
}: SurfaceContextWindowProps) {
  const { copyText: copyTextKit } = useClipboard({
    notify: copyNotify,
  });
  const live = useLiveSurfaceScope({ enabled: isOpen, surfaceName });
  // A value's machine name is an engineer's handle — admin-only, like the
  // surface key in the Agents menu. Everyone else reads the label.
  const isAdmin = useAppSelector(selectIsAdmin);
  /**
   * THE AVAILABILITY HALF (census #52, THE-MODEL law 3). This window's whole
   * job is completeness — what this page declares, supplies, and can be
   * written to. It stopped one question short: what the contract MAKES
   * POSSIBLE. An item is available here iff every surface value it consumes
   * has a read path here, so "declared + runtime keys" and "which portable AI
   * runs here" are the same fact seen twice — and the second view is the one
   * that shows the cost of a missing declaration. Same gate as the menu.
   */
  const availableHere = useAvailableHere({ surfaceName, enabled: isOpen });
  const manifest = getManifest(surfaceName);
  const declared = manifest?.values ?? [];
  const declaredNames = new Set(declared.map((value) => value.name));
  const runtimeOnlyKeys = Object.keys(live.scope).filter(
    (key) => !declaredNames.has(key),
  );
  const items: ContextItem[] = [
    ...declared.map((declaration) => ({
      key: declaration.name,
      kind: "declared" as const,
      declaration,
    })),
    ...runtimeOnlyKeys.map((key) => ({
      key,
      kind: "runtime" as const,
      declaration: null,
    })),
  ];
  // THE LIST is the context table: the same rows, hierarchy and switches as the
  // composer's chip and full view (one renderer, one data source). Each switch
  // is the person's real rule for this page.
  const dispatch = useAppDispatch();
  // A phone gets the table's touch rows (44px) and its phone column widths.
  const isMobile = useIsMobile();
  useEffect(() => {
    if (isOpen) void dispatch(ensureSurfaceFeatureLoaded(CONTEXT_RULES_FEATURE));
  }, [dispatch, isOpen]);
  const savedRules = useAppSelector(selectSavedContextRuleRows);
  const contextRows = surfaceContextRows(surfaceName, live.scope, savedRules);
  // The ONE placement the chip, the full view and a sent message use.
  const hierarchy: ContextHierarchy = { place: contextRowPlacer(surfaceName) };
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredItems = normalizedQuery
    ? items.filter((item) => {
        const declaration = item.declaration;
        return [item.key, declaration?.label, declaration?.description]
          .filter(Boolean)
          .some((value) =>
            String(value).toLowerCase().includes(normalizedQuery),
          );
      })
    : items;

  const filteredKeys = new Set(filteredItems.map((item) => item.key));
  const tableRows = contextRows.rows.filter((row) => filteredKeys.has(row.key));
  const selected =
    items.find((item) => item.key === selectedKey) ?? items[0] ?? null;
  const effectiveSelectedKey = selected?.key ?? null;
  const selectedRaw = selected ? live.scope[selected.key] : undefined;
  const selectedDisplay = displayValue(selectedRaw);
  // Supplied = the key is present (`undefined` is the only "not supplied");
  // an honestly-empty value is supplied and counted separately.
  const supplied = declared.filter(
    (value) => live.scope[value.name] !== undefined,
  ).length;
  const suppliedEmpty = declared.filter((value) =>
    isPresentEmpty(live.scope[value.name]),
  ).length;
  // "Missing" means ABSENT: a loaded-and-empty value ([] / "" / 0) is a real,
  // supplied answer (the surface contract), never a missing one.
  const missingRequiredNames = declared
    .filter((value) => value.alwaysAvailable && live.scope[value.name] === undefined)
    .map((value) => value.label);
  const missingRequired = missingRequiredNames.length;
  // What could be WRITTEN into this page right now — the write half of the
  // contract, beside the values. This is also the ONLY place a declared target
  // with no registered handler becomes visible BEFORE an agent tries it and
  // gets the loud runtime failure.
  const liveWriteTargets = listLiveWriteTargets().filter(
    (entry) => !surfaceName || entry.surfaceName === surfaceName,
  );
  // A target whose read twin is a view-only value (declared, not always
  // available) and is absent right now belongs to ANOTHER view of this page
  // (a settings tab that is not open): its handler mounts with that view. It
  // is not a defect here, so it is counted apart and never shown in red.
  const onOtherView = (entry: (typeof liveWriteTargets)[number]) => {
    const twin = entry.target.updatesValue;
    if (!twin) return false;
    const declaredTwin = declared.find((value) => value.name === twin);
    return Boolean(declaredTwin && !declaredTwin.alwaysAvailable && live.scope[twin] === undefined);
  };
  const otherViewTargets = liveWriteTargets.filter((entry) => !entry.hasHandler && onOtherView(entry));
  const unwiredTargets = liveWriteTargets.filter((entry) => !entry.hasHandler && !onOtherView(entry));
  // Refusals tallied by the KEY that caused them — the most actionable number
  // this window can show: "declare `file_name` here and 12 more items become
  // available". Only `missing_keys` refusals count; out-of-scope and
  // valve-excluded items are authoring decisions, not completeness defects.
  const missingKeyTally = new Map<string, number>();
  for (const item of availableHere.unavailable) {
    if (item.refusal.kind !== "missing_keys") continue;
    for (const key of item.refusal.missing) {
      missingKeyTally.set(key, (missingKeyTally.get(key) ?? 0) + 1);
    }
  }
  const topMissingKeys = [...missingKeyTally.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8);
  const presentation = statusPresentation(live.status);
  /** The live runtime answered — write-target counts below are only said when it did. */
  const liveRuntimeFailed = live.status === "error";
  // THE NAMING LAW — only the canonical manifest label, never an override.
  const friendlySurfaceName = surfaceName
    ? getSurfaceDisplayLabel(surfaceName)
    : "This Page";

  const copyText = async (text: string, key: string) => {
    if (!(await copyTextKit(text))) return;
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1200);
  };

  /**
   * Doors only — this window's own debug tool, not a fork of it. Mirrors the
   * two buttons already in the detail panel (Copy, Locate) so a right-click
   * anywhere in this window offers the same thing the UI already does,
   * instead of leaking through to whatever page it is inspecting.
   */
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const contextItemSection = (
    key: string | null,
  ): ContextMenuExtraSection => {
    const item = key ? (items.find((i) => i.key === key) ?? null) : null;
    const raw = item ? live.scope[item.key] : undefined;
    const items_: ContextMenuExtraItem[] = [
      {
        kind: "item",
        id: "surface-context-copy-key",
        label: "Copy key",
        icon: Copy,
        onSelect: () => item && void copyText(item.key, `${item.key}:key`),
        disabled: !item,
      },
      {
        kind: "item",
        id: "surface-context-copy-value",
        label: "Copy value",
        icon: Copy,
        onSelect: () =>
          item && void copyText(displayValue(raw), item.key),
        disabled: !item || !hasValue(raw),
      },
      {
        kind: "item",
        id: "surface-context-locate",
        label: "Locate on page",
        icon: Crosshair,
        onSelect: () => {
          if (!item) return;
          const found = locateSurfaceValueOnPage(item.key);
          if (!found) {
            toast.message("Not anchored on this page", {
              description:
                'No element is tagged data-surface-value="' + item.key + '" yet.',
            });
          }
        },
        disabled: !item,
      },
    ];
    return { id: "surface-context-item", label: "This value", items: items_ };
  };

  if (!isOpen) return null;

  return (
    <WindowPanel
      id="surface-context-window"
      overlayId="surfaceContextWindow"
      onClose={onClose}
      titleNode={
        <div className="flex min-w-0 items-center gap-1.5">
          <Braces className="h-4 w-4 shrink-0 text-primary" />
          {/* The same path the composer's value list heads this page with. */}
          {/* data-surface-name: the key, for proof tools on every seat (the
              visible key is admin-only). Not shown. */}
          <span className="truncate text-sm font-semibold" data-surface-name={surfaceName ?? undefined}>
            {surfaceName ? surfaceLevelPlace(surfaceName).path.join(" › ") : friendlySurfaceName}
          </span>
        </div>
      }
      width={900}
      height={620}
      minWidth={540}
      minHeight={360}
      position="center"
      bodyClassName="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0"
      sidebarDefaultSize={380}
      sidebarMinSize={300}
      defaultSidebarOpen
      actionsRight={
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={live.refresh}
            className="grid h-6 w-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Read the current page values now"
            aria-label="Refresh live surface values"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
          <CopyForAiButton
            compact
            icon={CopyForAiIcon}
            label={`${friendlySurfaceName} surface context`}
            agent={() => ({
              kind: "surface-context",
              location: `${friendlySurfaceName} — Surface Context`,
              description:
                "The current live values and declared variable contract for this page surface.",
              attributes: {
                status: live.status,
                declared: declared.length,
                supplied,
                suppliedEmpty,
                writeTargets: liveWriteTargets.length,
                unwiredWriteTargets: unwiredTargets.length,
                availableHere: availableHere.available.length,
              },
              context: {
                surface: friendlySurfaceName,
                surface_key: surfaceName || undefined,
                editable: isEditable,
              },
              data: {
                liveValues: live.scope,
                declarations: declared,
                runtimeOnlyKeys,
                missingRequired,
                runtimeError: live.error,
                // The write half: what an agent or a rendered result component
                // may change here, and whether the page actually wired it.
                writeTargets: liveWriteTargets.map((entry) => ({
                  name: entry.target.name,
                  label: entry.target.label,
                  mode: entry.target.mode,
                  applyPolicy: entry.target.applyPolicy ?? "manual",
                  updatesValue: entry.target.updatesValue ?? null,
                  description: entry.target.description,
                  hasHandler: entry.hasHandler,
                })),
                // Availability = capability: what the contract above makes
                // possible, and which single missing key unlocks how much.
                availableHere: availableHere.available.map((item) => ({
                  label: item.label,
                  requirements: item.requirements,
                  mandateKey: item.mandateKey,
                })),
                missingKeyUnlocks: Object.fromEntries(topMissingKeys),
              },
            })}
          />
          <button
            type="button"
            onClick={() =>
              void copyText(JSON.stringify(live.scope, null, 2), "all")
            }
            className="grid h-6 w-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Copy all current surface values"
            aria-label="Copy surface values as JSON"
          >
            {copied === "all" ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input adornment="start"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a surface value"
              />
            </div>
          </div>
          <NonEditableContextMenu
            sourceFeature="admin"
            contentSource={{ type: "raw" }}
            contextData={{ content: surfaceName }}
            extraSections={[contextItemSection(menuKey)]}
            resolveContextOnOpen={(target) => {
              const el = target?.closest<HTMLElement>("[role=\"row\"][data-key]");
              const key = el?.getAttribute("data-key") ?? null;
              setMenuKey(key);
              return { content: key ?? "" };
            }}
          >
          <div className="min-h-0 flex-1 overflow-y-auto pb-1">
            <ContextRulesTable
              rows={tableRows}
              cap={DEFAULT_INLINE_CAP}
              hierarchy={hierarchy}
              density={isMobile ? "comfortable" : "compact"}
              selectedKey={effectiveSelectedKey}
              onOpenRow={(key) => setSelectedKey(key)}
              onChange={(key, surfaceKey, next) =>
                void dispatch(saveContextRule({ surfaceKey, key, rule: next }))
              }
              onSetInclude={(changes) => void dispatch(saveContextRules(changes))}
              renderRowLead={(row) => {
                const state = contextRows.status[row.key];
                if (!state) return null;
                if (!state.declared) {
                  return (
                    <Badge
                      variant="outline"
                      className="h-4 px-1 text-[10px] text-amber-600 dark:text-amber-400"
                    >
                      Undeclared
                    </Badge>
                  );
                }
                return (
                  <span
                    title={
                      state.supplied === "present"
                        ? "Supplied"
                        : state.supplied === "empty"
                          ? "Supplied, empty"
                          : state.required
                            ? "Required, not supplied"
                            : "Not supplied"
                    }
                    className={cn(
                      "h-2 w-2 rounded-full",
                      state.supplied === "present"
                        ? "bg-emerald-500"
                        : state.supplied === "empty"
                          ? "border border-emerald-500 bg-transparent"
                          : state.required
                            ? "bg-destructive"
                            : "bg-muted-foreground/30",
                    )}
                  />
                );
              }}
              renderRowTrail={
                isAdmin ? (row) => <code className="text-[10px]">{row.key}</code> : undefined
              }
            />
            {/* read-gate-exempt: search result over the declared + live rows in this sidebar; a failed live read is announced by the ErrorAlchemyMenu notice this window pins at its bottom */}
            {filteredItems.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No matching values.
              </p>
            )}
          </div>
          </NonEditableContextMenu>
        </div>
      }
      footerLeft={
        <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
          <span
            className={cn("flex items-center gap-1", presentation.className)}
          >
            {live.status === "live" && (
              <CircleDot className="h-2.5 w-2.5 fill-current" />
            )}
            {presentation.label}
          </span>
          <span>
            <b className="text-foreground">{supplied}</b>/{declared.length}{" "}
            supplied
            {suppliedEmpty > 0 ? ` (${suppliedEmpty} empty)` : ""}
          </span>
          {missingRequired > 0 ? (
            <span
              className="flex items-center gap-1 text-destructive"
              title={`Promised on every open but absent: ${missingRequiredNames.join(", ")}`}
            >
              <TriangleAlert className="h-3 w-3" />
              {missingRequired} required missing: {missingRequiredNames.slice(0, 3).join(", ")}
              {missingRequiredNames.length > 3 ? "…" : ""}
            </span>
          ) : declared.length > 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              contract honored
            </span>
          ) : null}
          {/* The write half. `writable` counts what an AGENT may change here
              (a manual target is user-gesture-only, so it is not writable in
              this sense). An unwired target is a page defect — it is declared
              and nothing registered a handler, so the first write against it
              fails loudly. Showing it here is how it gets caught first. */}
          {liveWriteTargets.length > 0 && (
            <span
              title={liveWriteTargets
                .map(
                  (entry) =>
                    `${entry.target.name} (${entry.target.mode}, ${
                      entry.target.applyPolicy ?? "manual"
                    }${entry.hasHandler ? "" : ", NO HANDLER"})`,
                )
                .join("\n")}
            >
              <b className="text-foreground">
                {
                  liveWriteTargets.filter(
                    (entry) =>
                      (entry.target.applyPolicy ?? "manual") !== "manual",
                  ).length
                }
              </b>
              /{liveWriteTargets.length} agent-writable
            </span>
          )}
          {!liveRuntimeFailed && unwiredTargets.length > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <TriangleAlert className="h-3 w-3" />
              {unwiredTargets.length} write target
              {unwiredTargets.length === 1 ? "" : "s"} unwired
            </span>
          )}
          {!liveRuntimeFailed && runtimeOnlyKeys.length > 0 && (
            <span>{runtimeOnlyKeys.length} runtime-only</span>
          )}
          {!liveRuntimeFailed && otherViewTargets.length > 0 && (
            <span title={otherViewTargets.map((entry) => entry.target.label).join(", ")}>
              {otherViewTargets.length} on another view
            </span>
          )}
          {/* AVAILABILITY = CAPABILITY (#52). What the declared contract makes
              possible here, and what one more declaration would unlock. */}
          {availableHere.loaded && (
            <span
              title={
                availableHere.available.length > 0
                  ? `Available here:\n${availableHere.available
                      .map((item) => `• ${item.label}`)
                      .join("\n")}`
                  : "Nothing portable qualifies on this surface yet."
              }
            >
              <b className="text-foreground">
                {availableHere.available.length}
              </b>{" "}
              available here
            </span>
          )}
          {availableHere.loaded && topMissingKeys.length > 0 && (
            <span
              className="text-amber-600 dark:text-amber-400"
              title={`Declare (or emit) one of these and the count in brackets becomes available here:\n${topMissingKeys
                .map(([key, count]) => `• ${key} — unlocks ${count}`)
                .join("\n")}`}
            >
              {missingKeyTally.size} key
              {missingKeyTally.size === 1 ? "" : "s"} away from{" "}
              {availableHere.unavailable.filter(
                (item) => item.refusal.kind === "missing_keys",
              ).length}{" "}
              more
            </span>
          )}
          {/* 🚨 LOUD, COUNTED, VISIBLE — the KNOWN-VALUES clause of census #52
              is NOT delivered here. It is gated on the known-values design
              (PLAN 7.6, un-approved), so this window shows which items are
              available but cannot yet show which known values resolve. Said in
              the UI rather than left as a silent gap. */}
          <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
            known values: not yet
            <InfoHint text="Known-value resolution is not shown yet" />
          </span>
        </div>
      }
      footerRight={
        isAdmin ? (
          <code className="max-w-[300px] truncate font-mono text-[10px] text-muted-foreground">
            {surfaceName}
          </code>
        ) : null
      }
    >
      <NonEditableContextMenu
        sourceFeature="admin"
        contentSource={{ type: "raw" }}
        contextData={{ content: selected?.key ?? surfaceName }}
        extraSections={[contextItemSection(effectiveSelectedKey)]}
      >
      {selected ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-border p-4">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 basis-full flex-1">
                <h2 className="truncate text-base font-semibold">
                  {selected.declaration?.label ?? humanizeIdentifier(selected.key)}
                </h2>
                {isAdmin ? (
                  <code className="block truncate text-xs text-muted-foreground">
                    {selected.key}
                  </code>
                ) : null}
              </div>
              {selected.declaration && (
                <>
                  <Badge
                    variant={
                      selected.declaration.alwaysAvailable
                        ? "default"
                        : "secondary"
                    }
                  >
                    {selected.declaration.alwaysAvailable
                      ? "Always available"
                      : "Sometimes available"}
                  </Badge>
                  <Badge variant="outline">
                    {selected.declaration.valueType}
                  </Badge>
                  {selected.declaration.provenance.kind === "inherited" && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inherited from{" "}
                      {getSurfaceDisplayLabel(
                        selected.declaration.provenance.from,
                      )}
                    </Badge>
                  )}
                  {selected.declaration.provenance.kind === "baseline" && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Baseline
                    </Badge>
                  )}
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  const found = locateSurfaceValueOnPage(selected.key);
                  if (!found) {
                    toast.message("Not anchored on this page", {
                      description:
                        'No element is tagged data-surface-value="' +
                        selected.key +
                        '" yet.',
                    });
                  }
                }}
                className="flex h-11 items-center gap-1 rounded px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground sm:h-7 sm:px-2"
                title="Highlight where this value appears on the page"
              >
                <Crosshair className="h-3.5 w-3.5" />
                Locate
              </button>
              <button
                type="button"
                disabled={!hasValue(selectedRaw)}
                onClick={() => void copyText(selectedDisplay, selected.key)}
                className="flex h-11 items-center gap-1 rounded px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40 sm:h-7 sm:px-2"
              >
                {copied === selected.key ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                Copy
              </button>
            </div>
            {/* The declaration's `description` is agent-facing copy (code names, wire shapes);
                it never renders to a person — the label carries the meaning. */}
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-muted/15 p-4">
            {hasValue(selectedRaw) || isPresentEmpty(selectedRaw) ? (
              <>
              {isPresentEmpty(selectedRaw) && (
                <p className="mb-2 text-xs text-muted-foreground">
                  Supplied by the page, but empty
                </p>
              )}
              <pre className="min-h-full whitespace-pre-wrap break-words rounded-lg border border-border bg-card p-4 font-mono text-xs leading-relaxed shadow-sm">
                {selectedDisplay}
              </pre>
              </>
            ) : live.status === "error" ? (
              <ReadFailure
                error={live.error ?? true}
                what="this page's live values"
                className="m-0"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                <Braces className="h-10 w-10 text-muted-foreground/20" />
                <div>
                  <p className="text-sm font-medium">No current value</p>
                  <p className="mt-1 max-w-md text-xs text-muted-foreground">
                    {live.status === "live"
                      ? "The page is connected, but this variable is empty right now."
                      : "This page has not exposed a matching live surface runtime."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : live.status === "error" ? (
        <ReadFailure
          error={live.error ?? true}
          what="this page's live values"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <Braces className="h-12 w-12 text-primary/15" />
          <div>
            <h2 className="text-base font-semibold">{friendlySurfaceName}</h2>
            <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">
              No declared or emitted values yet
            </p>
          </div>
        </div>
      )}
      </NonEditableContextMenu>
      {live.error && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs text-destructive shadow-lg">
          {live.error}
          <ErrorAlchemyMenu error={live.error} />
        </div>
      )}
    </WindowPanel>
  );
}
