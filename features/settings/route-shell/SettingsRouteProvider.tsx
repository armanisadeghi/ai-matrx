"use client";

import type { ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
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
  /**
   * 🚨 THE ORGANIZATION A LINK NAMED (feedback 7dc1e5ae, 2026-09-21).
   *
   * A personal value is qualified by an organization: the same person holds a
   * different `personal_staff.escalation_mode` in each one. So a door from an
   * organization's configuration pane — "your own setting overrides this for
   * you, change it here" — that landed on whatever organization happened to be
   * active would show a DIFFERENT value than the one doing the masking, which
   * is the original defect wearing a link.
   *
   * This is not a default and not a fallback: nothing is chosen for anybody.
   * It is the organization THE PERSON CLICKED, honoured by this surface only,
   * for this read and the writes it makes. With no `org` in the URL the active
   * organization answers exactly as before, and with none of those the pane
   * says so and asks (`UniversalSettingsPane`), per the organization gate.
   */
  const namedOrganizationId = useSearchParams().get("org");

  return (
    <UniversalSettingsProvider
      target="user"
      enabled={active}
      organizationId={namedOrganizationId ?? undefined}
    >
      <SettingsDesignProvider variant={active ? "compact" : "standard"}>
        {children}
      </SettingsDesignProvider>
    </UniversalSettingsProvider>
  );
}
