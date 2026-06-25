"use client";

/**
 * SurfaceContextInspectorOverlay — the live "what values did this surface
 * actually supply?" inspector for the context menu.
 *
 * The single most important debugging surface for the value-mapping contract:
 * it lays the surface's DECLARED contract (every `SurfaceValue` from the
 * manifest, with its Always/Sometimes availability) against the LIVE resolved
 * `ApplicationScope` the menu is about to act on. Every declared key always
 * shows (present or not); a value shows whenever the surface supplied one.
 *
 * Loud-by-design: a value the surface declared `alwaysAvailable` (Always) but
 * failed to supply is a CONTRACT VIOLATION and renders in red — that is the
 * fastest way to catch a surface that isn't honoring its own manifest.
 *
 * Opened via the `surfaceContextInspector` overlay (data-only: surfaceName +
 * the resolved scope + isEditable all travel through `openOverlay` data).
 */

import { useCallback, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, CopyCheck, TriangleAlert } from "lucide-react";
import { getManifest } from "@/features/surfaces/manifests/registry";
import { allBaseline } from "@/features/surfaces/manifests/_baseline.manifest";
import { qualifyingDefaultSurfaces } from "@/features/surfaces/services/surface-bound-agents.service";
import type { SurfaceValue } from "@/features/surfaces/types";

export interface SurfaceContextInspectorOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  surfaceName: string | null;
  /** The live resolved ApplicationScope the menu acts on. */
  scope: Record<string, unknown>;
  isEditable: boolean;
}

/** Menu-control keys that ride on the scope but are not surface values. */
const NON_VALUE_KEYS = new Set(["contextFilter"]);

function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true; // number / boolean
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

export default function SurfaceContextInspectorOverlay({
  isOpen,
  onClose,
  surfaceName,
  scope,
  isEditable,
}: SurfaceContextInspectorOverlayProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = useCallback((text: string, key: string) => {
    void navigator.clipboard.writeText(text).then(() => {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1200);
    });
  }, []);

  // The declared contract: the surface's manifest values (which already include
  // the 5 injected baselines), or the bare baseline set for an undeclared
  // surface (the universal "Default" contract).
  const declared: readonly SurfaceValue[] = useMemo(() => {
    const manifest = surfaceName ? getManifest(surfaceName) : undefined;
    return manifest?.values ?? allBaseline();
  }, [surfaceName]);

  const declaredNames = useMemo(
    () => new Set(declared.map((v) => v.name)),
    [declared],
  );

  // Keys present on the scope that the surface never declared — stray values
  // that won't be bindable by name. Surfaced so they're not invisible.
  const undeclared = useMemo(
    () =>
      Object.keys(scope).filter(
        (k) => !declaredNames.has(k) && !NON_VALUE_KEYS.has(k),
      ),
    [scope, declaredNames],
  );

  const supplied = declared.filter((v) => hasValue(scope[v.name])).length;
  const violations = declared.filter(
    (v) => v.alwaysAvailable && !hasValue(scope[v.name]),
  ).length;

  const copyAll = useCallback(() => {
    copy(JSON.stringify(scope, null, 2), "__all__");
  }, [copy, scope]);

  const defaults = qualifyingDefaultSurfaces(isEditable);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85dvh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="text-base">Surface Context Values</span>
            <Badge variant="outline" className="font-mono text-[11px]">
              {surfaceName ?? "(no surface)"}
            </Badge>
            {isEditable && (
              <Badge variant="secondary" className="text-[10px]">
                editable
              </Badge>
            )}
            <div className="ml-auto">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs"
                onClick={copyAll}
              >
                {copiedKey === "__all__" ? (
                  <CopyCheck className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copiedKey === "__all__" ? "Copied" : "Copy scope JSON"}
              </Button>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Summary */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground border-b border-border pb-2">
          <span>
            <span className="font-semibold text-foreground">{declared.length}</span>{" "}
            declared
          </span>
          <span>
            <span className="font-semibold text-foreground">{supplied}</span>{" "}
            supplied
          </span>
          {violations > 0 ? (
            <span className="flex items-center gap-1 font-semibold text-destructive">
              <TriangleAlert className="h-3.5 w-3.5" />
              {violations} required value{violations === 1 ? "" : "s"} missing
            </span>
          ) : (
            <span className="text-emerald-600 dark:text-emerald-400">
              contract honored
            </span>
          )}
          {undeclared.length > 0 && (
            <span>
              <span className="font-semibold text-foreground">
                {undeclared.length}
              </span>{" "}
              undeclared
            </span>
          )}
        </div>

        <ScrollArea className="h-[62dvh] pr-3">
          <div className="space-y-1.5">
            {declared.map((v) => {
              const raw = scope[v.name];
              const present = hasValue(raw);
              const violation = v.alwaysAvailable && !present;
              return (
                <div
                  key={v.name}
                  className={`rounded-md border p-2 ${
                    violation
                      ? "border-destructive/50 bg-destructive/5"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-medium truncate">
                        {v.label}
                      </span>
                      <code className="text-[11px] text-muted-foreground">
                        {v.name}
                      </code>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Badge
                        variant={v.alwaysAvailable ? "default" : "secondary"}
                        className="text-[10px]"
                      >
                        {v.alwaysAvailable ? "Always" : "Sometimes"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {v.valueType}
                      </Badge>
                      {present && (
                        <span className="text-[10px] text-muted-foreground tabular-nums">
                          {charCount(raw)} ch
                        </span>
                      )}
                      {present && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() =>
                            copy(asDisplayString(raw), `v-${v.name}`)
                          }
                          title="Copy value"
                        >
                          {copiedKey === `v-${v.name}` ? (
                            <CopyCheck className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-1">
                    {violation ? (
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-destructive">
                        <TriangleAlert className="h-3.5 w-3.5" />
                        Declared “Always” but the surface supplied no value.
                      </div>
                    ) : present ? (
                      <pre className="text-[11px] font-mono whitespace-pre-wrap break-words max-h-28 overflow-y-auto rounded bg-muted px-2 py-1">
                        {asDisplayString(raw)}
                      </pre>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">
                        (no value)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}

            {undeclared.length > 0 && (
              <div className="pt-3">
                <h3 className="text-xs font-semibold mb-1.5 text-amber-600 dark:text-amber-400">
                  Undeclared values ({undeclared.length})
                  <span className="ml-2 font-normal text-muted-foreground">
                    on the scope but not in the manifest — not bindable by name
                  </span>
                </h3>
                <div className="space-y-1.5">
                  {undeclared.map((k) => (
                    <div key={k} className="rounded-md border border-border p-2">
                      <div className="flex items-center justify-between">
                        <code className="text-[11px] text-foreground">{k}</code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => copy(asDisplayString(scope[k]), `u-${k}`)}
                          title="Copy value"
                        >
                          {copiedKey === `u-${k}` ? (
                            <CopyCheck className="h-3 w-3 text-green-500" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                      <pre className="mt-1 text-[11px] font-mono whitespace-pre-wrap break-words max-h-28 overflow-y-auto rounded bg-muted px-2 py-1">
                        {asDisplayString(scope[k])}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <div className="border-t border-border pt-2 text-[11px] text-muted-foreground">
          Default agent contracts honored here:{" "}
          {defaults.map((d, i) => (
            <code key={d} className="text-foreground">
              {d}
              {i < defaults.length - 1 ? ", " : ""}
            </code>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
