"use client";

/**
 * SurfaceContextInspectorWindow — live "what values did this surface supply?"
 * inspector for the context menu (admin).
 *
 * Non-blocking WindowPanel (not a Dialog): sidebar lists every declared
 * SurfaceValue (+ undeclared scope keys); click opens a closeable tab in the
 * body so the user can inspect values side-by-side with the surface behind.
 *
 * Loud-by-design: Always-declared keys with no supplied value render red.
 */

import { useCallback, useMemo, useState } from "react";
import { Copy, CopyCheck, TriangleAlert, Braces, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { getManifest } from "@/features/surfaces/manifests/registry";
import { allBaseline } from "@/features/surfaces/manifests/_baseline.manifest";
import { qualifyingDefaultSurfaces } from "@/features/surfaces/services/surface-bound-agents.service";
import type { SurfaceValue } from "@/features/surfaces/types";
import { cn } from "@/lib/utils";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SurfaceContextInspectorWindowProps {
  isOpen: boolean;
  onClose: () => void;
  surfaceName: string | null;
  /** The live resolved ApplicationScope the menu acts on. */
  scope: Record<string, unknown>;
  isEditable: boolean;
}

/** Menu-control keys that ride on the scope but are not surface values. */
const NON_VALUE_KEYS = new Set(["contextFilter"]);

type TabId = string;

// ─── Value helpers ────────────────────────────────────────────────────────────

function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}

function asDisplayString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

function charCount(v: unknown): number {
  return asDisplayString(v).length;
}

function useCopyText() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = useCallback((text: string, key: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1200);
    });
  }, []);
  return { copiedKey, copy };
}

// ─── Derived inspector model ──────────────────────────────────────────────────

type InspectorItem =
  | { kind: "declared"; value: SurfaceValue }
  | { kind: "undeclared"; name: string };

function useInspectorModel(
  surfaceName: string | null,
  scope: Record<string, unknown>,
  isEditable: boolean,
) {
  const declared: readonly SurfaceValue[] = useMemo(() => {
    const manifest = surfaceName ? getManifest(surfaceName) : undefined;
    return manifest?.values ?? allBaseline();
  }, [surfaceName]);

  const declaredNames = useMemo(
    () => new Set(declared.map((v) => v.name)),
    [declared],
  );

  const undeclared = useMemo(
    () =>
      Object.keys(scope).filter(
        (k) => !declaredNames.has(k) && !NON_VALUE_KEYS.has(k),
      ),
    [scope, declaredNames],
  );

  const items: InspectorItem[] = useMemo(
    () => [
      ...declared.map((value): InspectorItem => ({ kind: "declared", value })),
      ...undeclared.map((name): InspectorItem => ({
        kind: "undeclared",
        name,
      })),
    ],
    [declared, undeclared],
  );

  const itemById = useMemo(() => {
    const map = new Map<TabId, InspectorItem>();
    for (const item of items) {
      map.set(item.kind === "declared" ? item.value.name : item.name, item);
    }
    return map;
  }, [items]);

  const supplied = declared.filter((v) => hasValue(scope[v.name])).length;
  const violations = declared.filter(
    (v) => v.alwaysAvailable && !hasValue(scope[v.name]),
  ).length;
  const defaults = qualifyingDefaultSurfaces(isEditable);

  return {
    declared,
    undeclared,
    items,
    itemById,
    supplied,
    violations,
    defaults,
  };
}

// ─── Tab state ────────────────────────────────────────────────────────────────

function useInspectorTabs() {
  const [openTabIds, setOpenTabIds] = useState<TabId[]>([]);
  const [activeTabId, setActiveTabId] = useState<TabId | null>(null);

  const openTab = useCallback((id: TabId) => {
    setOpenTabIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    setActiveTabId(id);
  }, []);

  const closeTab = useCallback((id: TabId) => {
    setOpenTabIds((prev) => {
      const next = prev.filter((t) => t !== id);
      setActiveTabId((active) => {
        if (active !== id) return active;
        return next.length > 0 ? next[next.length - 1] : null;
      });
      return next;
    });
  }, []);

  return { openTabIds, activeTabId, setActiveTabId, openTab, closeTab };
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function SidebarRow({
  label,
  name,
  present,
  violation,
  alwaysAvailable,
  isOpenTab,
  isActive,
  onSelect,
}: {
  label: string;
  name: string;
  present: boolean;
  violation: boolean;
  alwaysAvailable?: boolean;
  isOpenTab: boolean;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full min-w-0 items-start gap-1.5 border-l-2 px-2 py-1.5 text-left transition-colors",
        isActive
          ? "border-primary bg-primary/8"
          : "border-transparent hover:bg-muted/40",
        violation && !isActive && "bg-destructive/5",
      )}
    >
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex min-w-0 items-center gap-1">
          <span
            className={cn(
              "truncate text-[11px] font-medium",
              violation
                ? "text-destructive"
                : isActive
                  ? "text-primary"
                  : "text-foreground",
            )}
          >
            {label}
          </span>
          {isOpenTab && !isActive && (
            <span className="h-1 w-1 shrink-0 rounded-full bg-primary/60" />
          )}
        </div>
        <div className="flex min-w-0 items-center gap-1">
          <code className="truncate text-[10px] text-muted-foreground">
            {name}
          </code>
          {alwaysAvailable != null && (
            <Badge
              variant={alwaysAvailable ? "default" : "secondary"}
              className="h-3.5 shrink-0 px-1 text-[8px] leading-none"
            >
              {alwaysAvailable ? "Always" : "Sometimes"}
            </Badge>
          )}
          {!present && !violation && (
            <span className="shrink-0 text-[9px] italic text-muted-foreground/70">
              empty
            </span>
          )}
          {violation && (
            <TriangleAlert className="h-3 w-3 shrink-0 text-destructive" />
          )}
        </div>
      </div>
    </button>
  );
}

function InspectorSidebar({
  items,
  scope,
  openTabIds,
  activeTabId,
  onSelect,
}: {
  items: InspectorItem[];
  scope: Record<string, unknown>;
  openTabIds: TabId[];
  activeTabId: TabId | null;
  onSelect: (id: TabId) => void;
}) {
  const declared = items.filter(
    (i): i is Extract<InspectorItem, { kind: "declared" }> =>
      i.kind === "declared",
  );
  const undeclared = items.filter(
    (i): i is Extract<InspectorItem, { kind: "undeclared" }> =>
      i.kind === "undeclared",
  );

  return (
    <nav
      aria-label="Context values"
      className="flex h-full min-h-0 flex-col overflow-y-auto"
    >
      <div className="shrink-0 border-b border-border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        Declared ({declared.length})
      </div>
      {declared.map(({ value }) => {
        const present = hasValue(scope[value.name]);
        const violation = value.alwaysAvailable && !present;
        return (
          <SidebarRow
            key={value.name}
            label={value.label}
            name={value.name}
            present={present}
            violation={violation}
            alwaysAvailable={value.alwaysAvailable}
            isOpenTab={openTabIds.includes(value.name)}
            isActive={activeTabId === value.name}
            onSelect={() => onSelect(value.name)}
          />
        );
      })}

      {undeclared.length > 0 && (
        <>
          <div className="shrink-0 border-b border-t border-border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            Undeclared ({undeclared.length})
          </div>
          {undeclared.map(({ name }) => (
            <SidebarRow
              key={name}
              label={name}
              name={name}
              present={hasValue(scope[name])}
              violation={false}
              isOpenTab={openTabIds.includes(name)}
              isActive={activeTabId === name}
              onSelect={() => onSelect(name)}
            />
          ))}
        </>
      )}
    </nav>
  );
}

// ─── Tab bar (body content) ───────────────────────────────────────────────────

function TabBar({
  openTabIds,
  activeTabId,
  itemById,
  onActivate,
  onClose,
}: {
  openTabIds: TabId[];
  activeTabId: TabId | null;
  itemById: Map<TabId, InspectorItem>;
  onActivate: (id: TabId) => void;
  onClose: (id: TabId) => void;
}) {
  if (openTabIds.length === 0) return null;

  return (
    <div className="no-scrollbar flex h-8 shrink-0 items-end overflow-x-auto border-b border-border bg-muted/20 px-1">
      {openTabIds.map((id) => {
        const item = itemById.get(id);
        const label =
          item?.kind === "declared" ? item.value.label : (item?.name ?? id);
        const isActive = id === activeTabId;
        return (
          <div
            key={id}
            onClick={() => onActivate(id)}
            className={cn(
              "group flex h-full min-w-[80px] max-w-[180px] shrink-0 cursor-pointer select-none items-center rounded-t border border-b-0 pl-2.5 pr-1 transition-colors",
              isActive
                ? "z-10 translate-y-px border-border bg-background pb-px font-medium text-foreground"
                : "border-border/40 bg-muted/20 text-muted-foreground hover:border-border/70 hover:bg-muted/40 hover:text-foreground",
            )}
          >
            <span className="flex-1 truncate text-xs">{label}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose(id);
              }}
              className={cn(
                "ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm transition-colors",
                isActive
                  ? "text-muted-foreground hover:bg-muted"
                  : "text-muted-foreground opacity-0 hover:bg-muted/80 group-hover:opacity-100",
              )}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─── Value detail pane ────────────────────────────────────────────────────────

function ValueDetail({
  item,
  scope,
  copiedKey,
  onCopy,
}: {
  item: InspectorItem;
  scope: Record<string, unknown>;
  copiedKey: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  const name = item.kind === "declared" ? item.value.name : item.name;
  const raw = scope[name];
  const present = hasValue(raw);
  const violation =
    item.kind === "declared" && item.value.alwaysAvailable && !present;
  const display = asDisplayString(raw);
  const copyKey = `v-${name}`;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">
            {item.kind === "declared" ? item.value.label : name}
          </div>
          <code className="text-[11px] text-muted-foreground">{name}</code>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {item.kind === "declared" && (
            <>
              <Badge
                variant={item.value.alwaysAvailable ? "default" : "secondary"}
                className="text-[10px]"
              >
                {item.value.alwaysAvailable ? "Always" : "Sometimes"}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {item.value.valueType}
              </Badge>
            </>
          )}
          {item.kind === "undeclared" && (
            <Badge
              variant="outline"
              className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
            >
              undeclared
            </Badge>
          )}
          {present && (
            <span className="tabular-nums text-[10px] text-muted-foreground">
              {charCount(raw)} ch
            </span>
          )}
          {present && (
            <button
              type="button"
              onClick={() => onCopy(display, copyKey)}
              className="flex h-6 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Copy value"
            >
              {copiedKey === copyKey ? (
                <CopyCheck className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              <span>Copy</span>
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-3">
        {violation ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            Declared “Always” but the surface supplied no value.
          </div>
        ) : present ? (
          <pre className="min-w-0 whitespace-pre-wrap break-all rounded-md bg-muted px-3 py-2 font-mono text-[11px] leading-relaxed">
            {display}
          </pre>
        ) : (
          <span className="text-xs italic text-muted-foreground">
            (no value)
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Body ─────────────────────────────────────────────────────────────────────

function InspectorBody({
  openTabIds,
  activeTabId,
  itemById,
  scope,
  copiedKey,
  onActivate,
  onClose,
  onCopy,
}: {
  openTabIds: TabId[];
  activeTabId: TabId | null;
  itemById: Map<TabId, InspectorItem>;
  scope: Record<string, unknown>;
  copiedKey: string | null;
  onActivate: (id: TabId) => void;
  onClose: (id: TabId) => void;
  onCopy: (text: string, key: string) => void;
}) {
  const activeItem = activeTabId ? itemById.get(activeTabId) : undefined;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <TabBar
        openTabIds={openTabIds}
        activeTabId={activeTabId}
        itemById={itemById}
        onActivate={onActivate}
        onClose={onClose}
      />
      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {activeItem ? (
          <ValueDetail
            item={activeItem}
            scope={scope}
            copiedKey={copiedKey}
            onCopy={onCopy}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-muted-foreground">
            <Braces className="h-10 w-10 opacity-15" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                No value selected
              </p>
              <p className="text-xs opacity-60">
                Select a context value from the sidebar to inspect it.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Window inner ─────────────────────────────────────────────────────────────

function SurfaceContextInspectorWindowInner({
  onClose,
  surfaceName,
  scope,
  isEditable,
}: {
  onClose: () => void;
  surfaceName: string | null;
  scope: Record<string, unknown>;
  isEditable: boolean;
}) {
  const model = useInspectorModel(surfaceName, scope, isEditable);
  const tabs = useInspectorTabs();
  const { copiedKey, copy } = useCopyText();

  const copyAll = useCallback(() => {
    copy(JSON.stringify(scope, null, 2), "__all__");
  }, [copy, scope]);

  const titleNode = (
    <div className="flex max-w-[min(420px,50vw)] items-center justify-center gap-1.5 truncate">
      <span className="truncate text-sm font-medium">Context Values</span>
      <Badge
        variant="outline"
        className="max-w-[180px] truncate font-mono text-[10px]"
      >
        {surfaceName ?? "(no surface)"}
      </Badge>
      {isEditable && (
        <Badge variant="secondary" className="shrink-0 text-[10px]">
          editable
        </Badge>
      )}
    </div>
  );

  return (
    <WindowPanel
      id="surface-context-inspector-window"
      overlayId="surfaceContextInspector"
      onClose={onClose}
      titleNode={titleNode}
      width={920}
      height={640}
      minWidth={560}
      minHeight={360}
      position="center"
      bodyClassName="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0"
      sidebarDefaultSize={220}
      sidebarMinSize={160}
      defaultSidebarOpen
      actionsRight={
        <button
          type="button"
          onClick={copyAll}
          className="flex h-6 items-center gap-1 rounded px-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Copy full scope JSON"
        >
          {copiedKey === "__all__" ? (
            <CopyCheck className="h-3 w-3 text-green-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          <span>{copiedKey === "__all__" ? "Copied" : "Copy JSON"}</span>
        </button>
      }
      sidebar={
        <InspectorSidebar
          items={model.items}
          scope={scope}
          openTabIds={tabs.openTabIds}
          activeTabId={tabs.activeTabId}
          onSelect={tabs.openTab}
        />
      }
      footerLeft={
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>
            <span className="font-semibold text-foreground">
              {model.declared.length}
            </span>{" "}
            declared
          </span>
          <span>
            <span className="font-semibold text-foreground">
              {model.supplied}
            </span>{" "}
            supplied
          </span>
          {model.violations > 0 ? (
            <span className="flex items-center gap-1 font-semibold text-destructive">
              <TriangleAlert className="h-3 w-3" />
              {model.violations} missing
            </span>
          ) : (
            <span className="text-emerald-600 dark:text-emerald-400">
              contract honored
            </span>
          )}
          {model.undeclared.length > 0 && (
            <span>
              <span className="font-semibold text-foreground">
                {model.undeclared.length}
              </span>{" "}
              undeclared
            </span>
          )}
        </div>
      }
      footerRight={
        <span className="max-w-[280px] truncate text-[10px] text-muted-foreground">
          Defaults:{" "}
          {model.defaults.map((d, i) => (
            <code key={d} className="text-foreground">
              {d}
              {i < model.defaults.length - 1 ? ", " : ""}
            </code>
          ))}
        </span>
      }
    >
      <InspectorBody
        openTabIds={tabs.openTabIds}
        activeTabId={tabs.activeTabId}
        itemById={model.itemById}
        scope={scope}
        copiedKey={copiedKey}
        onActivate={tabs.setActiveTabId}
        onClose={tabs.closeTab}
        onCopy={copy}
      />
    </WindowPanel>
  );
}

// ─── Shell ────────────────────────────────────────────────────────────────────

export default function SurfaceContextInspectorWindow({
  isOpen,
  onClose,
  surfaceName,
  scope,
  isEditable,
}: SurfaceContextInspectorWindowProps) {
  if (!isOpen) return null;
  return (
    <SurfaceContextInspectorWindowInner
      onClose={onClose}
      surfaceName={surfaceName}
      scope={scope}
      isEditable={isEditable}
    />
  );
}
