"use client";

import type { ReactNode } from "react";
import { SettingsDesignProvider } from "@/components/official/settings/SettingsDesignProvider";
import { UniversalSettingsProvider } from "@/features/settings/universal/UniversalSettingsContext";

/**
 * The one settings context boundary for the route surface.
 *
 * AppShell mounts this below Redux around its sidebar, content, and mobile
 * sheet. Route menus are portaled siblings of the page, so a page-local
 * provider would make the two trees fetch and select independently.
 */
export function SettingsRouteProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  if (!active) return children;

  return (
    <UniversalSettingsProvider>
      <SettingsDesignProvider variant="compact">
        {children}
      </SettingsDesignProvider>
    </UniversalSettingsProvider>
  );
}
