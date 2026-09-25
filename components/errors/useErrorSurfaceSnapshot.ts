"use client";

/**
 * useErrorSurfaceSnapshot — which surface an error sits in, and that
 * surface's DECLARED values, for the error's Alchemy payload.
 *
 * Resolution order (the most specific wins):
 *   1. the nearest `AlchemySurfaceBridge` above the error (every
 *      `SurfaceRuntimeProvider` mounts one) — the exact surface the error
 *      renders inside, even a nested panel;
 *   2. the page's active surface (deepest live runtime when it is an overlay or
 *      matches the route; otherwise the route's mapping);
 *   3. nothing — the payload then says plainly that the page is unregistered.
 *
 * Values are read at click time from the live provider when its `getScope`
 * answers synchronously. An async provider is captured through the bridge's
 * handle when the error first appears (and again whenever `refresh()` runs —
 * the menu calls it on pointer-enter), so the click never waits.
 *
 * Only declared, exportable, non-secret values leave (see
 * `pickDeclaredSurfaceValues`).
 */
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useContentTransferSurface } from "@ai-matrx/design-system/content-transfer";
import type { SurfaceHandle } from "@ai-matrx/kit/content-transfer";
import { getManifest } from "@/features/surfaces/manifests/registry";
import {
  getSurfaceRuntime,
  getSurfaceRuntimeForName,
  getRegisteredSurfaceScopeContributions,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { surfaceFromPathname } from "@/features/surfaces/utils/route-to-surface";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";
import {
  pickDeclaredSurfaceValues,
  type ErrorSurfaceSnapshot,
} from "@/components/errors/error-alchemy";

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    !!value &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/** The surface an error on `pathname` belongs to, without React context. */
export function resolveErrorSurfaceName(
  pathname: string | null,
  bridgeSurfaceName?: string | null,
): string | null {
  if (bridgeSurfaceName) return bridgeSurfaceName;
  const runtime = getSurfaceRuntime();
  const routeSurface = surfaceFromPathname(pathname);
  if (runtime?.surfaceName) {
    const isOverlay = !!getManifest(runtime.surfaceName)?.overlayId;
    if (isOverlay || !routeSurface || runtime.surfaceName === routeSurface) {
      return runtime.surfaceName;
    }
  }
  return routeSurface ?? runtime?.surfaceName ?? null;
}

/**
 * Read the snapshot NOW (click time). `captured` is the value the bridge
 * handle produced earlier for an async provider, if any.
 */
export function readErrorSurfaceSnapshot(
  pathname: string | null,
  bridgeSurfaceName?: string | null,
  captured?: { surfaceName: string; values: Record<string, unknown> } | null,
): ErrorSurfaceSnapshot {
  const name = resolveErrorSurfaceName(pathname, bridgeSurfaceName);
  const manifest = name ? getManifest(name) : undefined;
  if (!name || !manifest) {
    return {
      surfaceName: name,
      label: null,
      status: "unregistered",
      declared: [],
      values: null,
      ...(name
        ? {
            note: `"${name}" is named for this page but has no surface declaration. Register it to include its declared values.`,
          }
        : {}),
    };
  }
  const declared = manifest.values.map((v) => v.name);
  const base = {
    surfaceName: name,
    label: getSurfaceDisplayLabel(name),
    declared,
  };
  const runtime = getSurfaceRuntimeForName(name);
  if (runtime) {
    try {
      const scope = runtime.getScope();
      if (!isThenable(scope)) {
        let merged: Record<string, unknown> = { ...(scope as Record<string, unknown>) };
        try {
          merged = { ...merged, ...getRegisteredSurfaceScopeContributions(name) };
        } catch {
          // A contribution conflict is the surface's own loud contract error;
          // the provider's scope still stands on its own.
        }
        return {
          ...base,
          status: "live",
          values: pickDeclaredSurfaceValues(merged, manifest.values),
        };
      }
    } catch (error) {
      return {
        ...base,
        status: "error",
        values: null,
        note: `The surface refused to give its values: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
  if (captured && captured.surfaceName === name) {
    return {
      ...base,
      status: "captured",
      values: pickDeclaredSurfaceValues(captured.values, manifest.values),
    };
  }
  return { ...base, status: "route-only", values: null };
}

async function captureThroughHandle(
  handle: SurfaceHandle,
  signal: AbortSignal,
): Promise<Record<string, unknown> | null> {
  if (!handle.isMounted()) return null;
  const source = await handle.capture(signal);
  const payload = source.snapshot.payload;
  if (payload.kind === "json" && payload.value && typeof payload.value === "object" && !Array.isArray(payload.value)) {
    return payload.value as Record<string, unknown>;
  }
  return null;
}

type CapturedValues = { surfaceName: string; values: Record<string, unknown> };
type CaptureRefs = {
  captured: { current: CapturedValues | null };
  inflight: { current: AbortController | null };
};

function startCapture(handle: SurfaceHandle | null, refs: CaptureRefs): void {
  if (!handle) return;
  refs.inflight.current?.abort();
  const controller = new AbortController();
  refs.inflight.current = controller;
  captureThroughHandle(handle, controller.signal)
    .then((values) => {
      if (values && !controller.signal.aborted) {
        refs.captured.current = { surfaceName: handle.surfaceName, values };
      }
    })
    .catch(() => {
      // An unmounted or refusing surface leaves the payload's honest
      // route-only / error status in place — nothing to scream here.
    });
}

export function useErrorSurfaceSnapshot(): {
  read: () => ErrorSurfaceSnapshot;
  refresh: () => void;
} {
  const pathname = usePathname();
  const handle = useContentTransferSurface();
  const captured = useRef<CapturedValues | null>(null);
  const inflight = useRef<AbortController | null>(null);

  // Capture once per surface the error is mounted in.
  useEffect(() => {
    const refs = { captured, inflight };
    startCapture(handle, refs);
    return () => refs.inflight.current?.abort();
  }, [handle]);

  return {
    read: () => readErrorSurfaceSnapshot(pathname, handle?.surfaceName, captured.current),
    refresh: () => startCapture(handle, { captured, inflight }),
  };
}
