"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { SettingsDesignProvider } from "@/components/official/settings/SettingsDesignProvider";
import { UniversalSettingsProvider } from "@/features/settings/universal/UniversalSettingsContext";
import { isUserSettingsPath } from "./settings-route-path";

/**
 * The one settings context boundary for the route surface.
 *
 * AppShell mounts this below Redux around its sidebar, content, and mobile
 * sheet. Route menus are portaled siblings of the page, so a page-local
 * provider would make the two trees fetch and select independently.
 */
export function SettingsRouteProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active = isUserSettingsPath(pathname);

  return (
    <UniversalSettingsProvider target="user" enabled={active}>
      <SettingsDesignProvider variant={active ? "compact" : "standard"}>
        {children}
      </SettingsDesignProvider>
    </UniversalSettingsProvider>
  );
}
