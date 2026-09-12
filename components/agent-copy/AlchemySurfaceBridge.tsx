"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import {
  createSurfaceTransferHandle,
  type SurfaceHandle,
} from "@ai-matrx/kit/content-transfer";
import { ContentTransferSurfaceProvider } from "@ai-matrx/design-system/content-transfer";
import { getManifest } from "@/features/surfaces/manifests/registry";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

/**
 * Creates a handle for this exact React mount. Hook-only runtime registrations
 * can return this handle to an explicit local provider; no global same-name
 * lookup is ever used to obtain scope.
 */
export function useAlchemySurfaceHandle(
  surfaceName: string,
  getScope: () => SurfaceScopePayload | Promise<SurfaceScopePayload>,
): SurfaceHandle {
  const instanceId = useId();
  const mounted = useRef(false);
  const current = useRef({ surfaceName, getScope });
  useEffect(() => {
    current.current = { surfaceName, getScope };
  });
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const manifest = getManifest(surfaceName);
  return createSurfaceTransferHandle({
    instanceId: `alchemy:${instanceId}:${surfaceName}`,
    manifest: manifest ?? { surfaceName, values: [] },
    isMounted: () =>
      mounted.current && current.current.surfaceName === surfaceName,
    getScope: async () => {
      if (!manifest) {
        throw new Error(
          `Alchemy has no declaration for ${surfaceName}. Register the surface declaration before exporting its values.`,
        );
      }
      return current.current.getScope();
    },
  });
}

export function AlchemySurfaceBridge({
  surfaceName,
  getScope,
  children,
}: {
  surfaceName: string;
  getScope: () => SurfaceScopePayload | Promise<SurfaceScopePayload>;
  children: ReactNode;
}) {
  const handle = useAlchemySurfaceHandle(surfaceName, getScope);
  return (
    <ContentTransferSurfaceProvider handle={handle}>
      {children}
    </ContentTransferSurfaceProvider>
  );
}
