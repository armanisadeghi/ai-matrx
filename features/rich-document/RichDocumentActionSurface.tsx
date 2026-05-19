"use client";

// features/rich-document/RichDocumentActionSurface.tsx
//
// Renders the actions registered by the top-of-stack RichDocument provider
// for a given surfaceId. Place anywhere in the tree (header, sidebar,
// modal footer) and connect to a RichDocument via `actionsSurfaceId`.
//
// Reads `providerId` from the Redux slice and looks up the live action
// list + ctx-factory from the module-scope bridge — keeping handlers
// completely out of Redux state per the doctrine.
//
// When no provider is registered, renders `fallback` (defaults to null).

import * as React from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import { selectTopProvider } from "./redux/actionSurfacesSlice";
import { getBridge } from "./runtime/providerBridge";
import { ActionBar } from "./variants/ActionBar";
import { MiniActionBar } from "./variants/MiniActionBar";
import { MenuVariant } from "./variants/MenuVariant";

export interface RichDocumentActionSurfaceProps {
  surfaceId: string;
  /** Which inline variant to render. Defaults to "bar". */
  variant?: "bar" | "mini-bar" | "menu";
  className?: string;
  /** Rendered when no provider is currently registered. */
  fallback?: React.ReactNode;
}

export function RichDocumentActionSurface(
  props: RichDocumentActionSurfaceProps,
): React.ReactElement | null {
  const { surfaceId, variant = "bar", className, fallback = null } = props;

  const provider = useAppSelector((state) =>
    selectTopProvider(state, surfaceId),
  );

  // No provider in this surface's stack — render fallback.
  if (!provider) {
    return <>{fallback}</>;
  }

  // Look up the live bridge (action list + ctx-factory) by providerId.
  // If the bridge is missing (e.g. the host component unmounted between
  // the selector read and this lookup), treat it as no provider — fall
  // back gracefully.
  const bridge = getBridge(provider.providerId);
  if (!bridge) {
    return <>{fallback}</>;
  }

  switch (variant) {
    case "bar":
      return (
        <ActionBar
          actions={bridge.resolvedActions}
          getCtx={bridge.getCtx}
          className={className}
        />
      );
    case "mini-bar":
      return (
        <MiniActionBar
          actions={bridge.resolvedActions}
          getCtx={bridge.getCtx}
          className={className}
        />
      );
    case "menu":
      return (
        <MenuVariant
          actions={bridge.resolvedActions}
          getCtx={bridge.getCtx}
          className={cn(className)}
        />
      );
    default:
      return null;
  }
}

export default RichDocumentActionSurface;
