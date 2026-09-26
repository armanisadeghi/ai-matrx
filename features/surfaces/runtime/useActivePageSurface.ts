"use client";

/**
 * useActivePageSurface — THE answer to "which surface is the person looking at
 * right now?", shared by every chrome host that binds to the page (the header
 * Agents menu, Quick Chat's "Include page context").
 *
 * An OVERLAY surface (a manifest declaring `overlayId`) registers a runtime
 * ONLY while its window/drawer is actually open, and it renders literally on
 * top of the route. So when one is the deepest live runtime it IS what the
 * user is looking at, even on a route that has its own mapping.
 *
 * Without this case an overlay surface could never become primary on a mapped
 * route, and several already-adopted ones are only reachable there.
 * `matrx-user/quick-note-save` is the worked example: the Quick Save Note
 * window opens ONLY from a chat message's Save as > Note, so it is always over
 * `/chat/[id]` — the panel resolved `matrx-user/chat`, listed and RAN the
 * chat's agents against the chat's scope, and the window's declared values and
 * `note_draft` write target were unreachable by construction.
 *
 * The same holds for a runtime registered inside a `SurfaceLayerBoundary`
 * (a dialog opened inside the page's own tree, such as Table settings): it is
 * a layer too. Whichever layer wins, the page under it is NOT lost — it rides
 * in the run's `surface_chain` (`surface-chain.ts`).
 *
 * Otherwise the page's registered runtime surface wins when it matches the
 * route (or when the route has no mapping yet).
 */

import { usePathname } from "next/navigation";
import { getManifest } from "@/features/surfaces/manifests/registry";
import {
  useSurfaceRuntime,
  type SurfaceRuntimeValue,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { surfaceFromPathname } from "@/features/surfaces/utils/route-to-surface";

export interface ActivePageSurface {
  /** The surface the person is looking at; null on an unregistered page. */
  surfaceName: string | null;
  /** The deepest mounted runtime (may belong to a different surface). */
  runtime: SurfaceRuntimeValue | null;
  /** True when `runtime` is the live provider for `surfaceName`. */
  hasLiveScope: boolean;
}

export function useActivePageSurface(): ActivePageSurface {
  const pathname = usePathname();
  const runtime = useSurfaceRuntime();
  const routeSurface = surfaceFromPathname(pathname);
  // A LAYER (a dialog, window, sheet or panel open over the page — overlay
  // manifests, and any runtime inside a `SurfaceLayerBoundary`) is what the
  // person is looking at while it is open. The route's page stays in the
  // run's context as a level of the surface chain.
  const runtimeIsOverlay =
    !!runtime?.surfaceName &&
    (!!runtime.layer || !!getManifest(runtime.surfaceName)?.overlayId);
  const surfaceName =
    runtime?.surfaceName &&
    (runtimeIsOverlay || !routeSurface || runtime.surfaceName === routeSurface)
      ? runtime.surfaceName
      : (routeSurface ?? runtime?.surfaceName ?? null);
  return {
    surfaceName,
    runtime,
    hasLiveScope: !!surfaceName && runtime?.surfaceName === surfaceName,
  };
}
