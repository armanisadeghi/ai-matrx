"use client";

/**
 * The /user-settings title below `lg`. On desktop the settings sidebar's brand
 * reads "Settings"; with no sidebar (phone, tablet) the header was blank
 * (page-pass shared defects, 2026-09-27). Names the open section, or
 * "Settings" on the overview.
 */

import { usePathname } from "next/navigation";
import { findTab } from "@/features/settings/registry";
import { SETTINGS_BASE, urlToTabId } from "./routing";

export function SettingsPhoneTitle() {
  const pathname = usePathname() ?? SETTINGS_BASE;
  const rest = pathname.startsWith(SETTINGS_BASE) ? pathname.slice(SETTINGS_BASE.length) : "";
  const tabId = urlToTabId(rest.split("/").filter(Boolean));
  const label = (tabId && findTab(tabId)?.label) || "Settings";
  return (
    <h1 className="min-w-0 truncate px-2 text-sm font-semibold text-foreground">{label}</h1>
  );
}
