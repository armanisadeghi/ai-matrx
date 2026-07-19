"use client";

import { useState } from "react";
import {
  Braces,
  Check,
  CircleDot,
  Copy,
  RefreshCw,
  Search,
  TriangleAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { getManifest } from "@/features/surfaces/manifests/registry";
import { useLiveSurfaceScope } from "@/features/surfaces/runtime/useLiveSurfaceScope";
import type { SurfaceValue } from "@/features/surfaces/types";
import { cn } from "@/lib/utils";

export interface SurfaceContextWindowProps {
  isOpen: boolean;
  onClose: () => void;
  surfaceName: string;
  surfaceLabel?: string | null;
  isEditable?: boolean;
}

const NON_VALUE_KEYS = new Set(["contextFilter"]);

function hasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
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
  | { key: string; kind: "declared"; declaration: SurfaceValue }
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
  surfaceLabel,
  isEditable = false,
}: SurfaceContextWindowProps) {
  const live = useLiveSurfaceScope({ enabled: isOpen, surfaceName });
  const manifest = getManifest(surfaceName);
  const declared = manifest?.values ?? [];
  const declaredNames = new Set(declared.map((value) => value.name));
  const runtimeOnlyKeys = Object.keys(live.scope).filter(
    (key) => !declaredNames.has(key) && !NON_VALUE_KEYS.has(key),
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
  const selected =
    items.find((item) => item.key === selectedKey) ?? items[0] ?? null;
  const effectiveSelectedKey = selected?.key ?? null;
  const selectedRaw = selected ? live.scope[selected.key] : undefined;
  const selectedDisplay = displayValue(selectedRaw);
  const supplied = declared.filter((value) =>
    hasValue(live.scope[value.name]),
  ).length;
  const missingRequired = declared.filter(
    (value) => value.alwaysAvailable && !hasValue(live.scope[value.name]),
  ).length;
  const presentation = statusPresentation(live.status);

  const copyText = async (text: string, key: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1200);
  };

  if (!isOpen) return null;

  return (
    <WindowPanel
      id="surface-context-window"
      overlayId="surfaceContextWindow"
      onClose={onClose}
      titleNode={
        <div className="flex min-w-0 items-center gap-2">
          <Braces className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold">
            Surface Context
          </span>
          <Badge
            variant="outline"
            className={cn("shrink-0 text-[10px]", presentation.className)}
          >
            {live.status === "live" && (
              <CircleDot className="mr-1 h-2.5 w-2.5 fill-current" />
            )}
            {presentation.label}
          </Badge>
        </div>
      }
      width={900}
      height={620}
      minWidth={540}
      minHeight={360}
      position="center"
      bodyClassName="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-0"
      sidebarDefaultSize={260}
      sidebarMinSize={190}
      defaultSidebarOpen
      actionsRight={
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={live.refresh}
            className="flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Read the current page values now"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() =>
              void copyText(JSON.stringify(live.scope, null, 2), "all")
            }
            className="flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Copy all current surface values"
          >
            {copied === "all" ? (
              <Check className="h-3.5 w-3.5 text-emerald-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            JSON
          </button>
        </div>
      }
      sidebar={
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a surface value"
                className="h-8 pl-7 text-base sm:text-xs"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {filteredItems.map((item) => {
              const present = hasValue(live.scope[item.key]);
              const required = item.declaration?.alwaysAvailable === true;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelectedKey(item.key)}
                  className={cn(
                    "flex w-full min-w-0 items-start gap-2 border-l-2 px-2.5 py-2 text-left transition-colors",
                    effectiveSelectedKey === item.key
                      ? "border-primary bg-primary/8"
                      : "border-transparent hover:bg-muted/50",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      present
                        ? "bg-emerald-500"
                        : required
                          ? "bg-destructive"
                          : "bg-muted-foreground/30",
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium">
                      {item.declaration?.label ?? item.key}
                    </span>
                    <code className="block truncate text-[10px] text-muted-foreground">
                      {item.key}
                    </code>
                  </span>
                  {item.kind === "runtime" && (
                    <Badge
                      variant="outline"
                      className="shrink-0 text-[8px] text-amber-600 dark:text-amber-400"
                    >
                      runtime
                    </Badge>
                  )}
                </button>
              );
            })}
            {filteredItems.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-muted-foreground">
                No matching values.
              </p>
            )}
          </div>
        </div>
      }
      footerLeft={
        <div className="flex flex-wrap items-center gap-x-3 text-[11px] text-muted-foreground">
          <span>
            <b className="text-foreground">{supplied}</b>/{declared.length}{" "}
            supplied
          </span>
          {missingRequired > 0 ? (
            <span className="flex items-center gap-1 text-destructive">
              <TriangleAlert className="h-3 w-3" />
              {missingRequired} required missing
            </span>
          ) : declared.length > 0 ? (
            <span className="text-emerald-600 dark:text-emerald-400">
              contract honored
            </span>
          ) : null}
          {runtimeOnlyKeys.length > 0 && (
            <span>{runtimeOnlyKeys.length} runtime-only</span>
          )}
        </div>
      }
      footerRight={
        <code className="max-w-[300px] truncate text-[10px] text-muted-foreground">
          {surfaceName}
        </code>
      }
    >
      {selected ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="shrink-0 border-b border-border p-4">
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-base font-semibold">
                  {selected.declaration?.label ?? selected.key}
                </h2>
                <code className="text-xs text-muted-foreground">
                  {selected.key}
                </code>
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
                </>
              )}
              <button
                type="button"
                disabled={!hasValue(selectedRaw)}
                onClick={() => void copyText(selectedDisplay, selected.key)}
                className="flex h-7 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                {copied === selected.key ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                Copy
              </button>
            </div>
            {selected.declaration?.description && (
              <p className="mt-2 max-w-3xl text-xs leading-relaxed text-muted-foreground">
                {selected.declaration.description}
              </p>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-muted/15 p-4">
            {hasValue(selectedRaw) ? (
              <pre className="min-h-full whitespace-pre-wrap break-words rounded-lg border border-border bg-card p-4 font-mono text-xs leading-relaxed shadow-sm">
                {selectedDisplay}
              </pre>
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
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <Braces className="h-12 w-12 text-primary/15" />
          <div>
            <h2 className="text-base font-semibold">
              {surfaceLabel || manifest?.label || surfaceName}
            </h2>
            <p className="mt-1 max-w-lg text-xs leading-relaxed text-muted-foreground">
              This surface has no declared or emitted values to inspect yet.
              {isEditable
                ? " The page reports that its content is editable."
                : ""}
            </p>
          </div>
        </div>
      )}
      {live.error && (
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs text-destructive shadow-lg">
          {live.error}
        </div>
      )}
    </WindowPanel>
  );
}
