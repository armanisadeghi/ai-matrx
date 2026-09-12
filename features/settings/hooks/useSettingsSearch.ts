"use client";

import { useMemo } from "react";
import { settingsRegistry, getVisibleTabs } from "../registry";
import type { SettingsTabDef } from "../types";
import { useUniversalSettings } from "../universal/UniversalSettingsContext";
import { staticSettingsControlIndex } from "../static-control-index";

export type SettingsSearchHit = {
  tab: SettingsTabDef;
  /** Field where the match occurred. */
  matchedIn: "label" | "description" | "keyword";
  /** The matched substring (for highlighting). */
  matchText: string;
};

export type SettingsControlSearchHit = {
  id: string;
  label: string;
  description?: string;
  tabId: string;
  controlId?: string;
  href: string;
};

/**
 * Public exact-control search for the route shell. Static registry results are
 * always available; registry rows add their canonical full key as the anchor
 * once the shared settings provider has read them.
 */
export function useSettingsControlSearch(
  query: string,
  isAdmin: boolean,
): SettingsControlSearchHit[] {
  const { knobs, domains } = useUniversalSettings();
  const trimmed = query.trim().toLowerCase();
  const visible = useMemo(() => getVisibleTabs(isAdmin), [isAdmin]);
  return useMemo(() => {
    if (!trimmed) return [];
    const visibleTabIds = new Set(visible.map((tab) => tab.id));
    const staticHits = staticSettingsControlIndex
      .filter((control) => visibleTabIds.has(control.tabId))
      .filter((control) => [control.label, control.description]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(trimmed)))
      .map((control) => ({
        id: `static:${control.controlId}`,
        label: control.label,
        description: control.description,
        tabId: control.tabId,
        controlId: control.controlId,
        href: `/user-settings/${control.tabId.replace(/\./g, "/")}?control=${encodeURIComponent(control.controlId)}`,
      }));
    const controls = knobs.flatMap((knob) => {
      const section = domains.flatMap((domain) => [
        ...(domain.domainLeafId === null ? [] : [{ id: domain.domainLeafId, knobs: domain.knobs }]),
        ...domain.features,
      ]).find((candidate) => candidate.knobs.some((item) => item.full_key === knob.full_key));
      const haystack = [knob.full_key, knob.label, knob.description, knob.ui.help]
        .filter((value): value is string => typeof value === "string")
        .join(" ").toLowerCase();
      if (!section || !haystack.includes(trimmed)) return [];
      return [{
        id: knob.full_key,
        label: knob.label,
        description: knob.description || undefined,
        tabId: section.id,
        controlId: knob.full_key,
        href: `/user-settings/${section.id.replace(/^config\./, "config/").replace(/\./g, "/")}?control=${encodeURIComponent(knob.full_key)}`,
      }];
    });
    return [...controls, ...staticHits];
  }, [domains, knobs, trimmed, visible]);
}

/**
 * Searches the settings registry and returns ranked hits.
 * Results are ordered: label match > keyword match > description match,
 * preserving registry order within each bucket.
 */
export function useSettingsSearch(
  query: string,
  options?: { isAdmin?: boolean },
): SettingsSearchHit[] {
  const trimmed = query.trim().toLowerCase();
  const visible = useMemo(
    () => getVisibleTabs(options?.isAdmin ?? false),
    [options?.isAdmin],
  );

  return useMemo(() => {
    if (!trimmed) return [];
    const byLabel: SettingsSearchHit[] = [];
    const byKeyword: SettingsSearchHit[] = [];
    const byDescription: SettingsSearchHit[] = [];

    for (const tab of visible) {
      const label = tab.label.toLowerCase();
      if (label.includes(trimmed)) {
        byLabel.push({ tab, matchedIn: "label", matchText: trimmed });
        continue;
      }
      const kwHit = tab.searchKeywords?.find((k) =>
        k.toLowerCase().includes(trimmed),
      );
      if (kwHit) {
        byKeyword.push({ tab, matchedIn: "keyword", matchText: kwHit });
        continue;
      }
      if (tab.description?.toLowerCase().includes(trimmed)) {
        byDescription.push({
          tab,
          matchedIn: "description",
          matchText: trimmed,
        });
      }
    }

    return [...byLabel, ...byKeyword, ...byDescription];
  }, [trimmed, visible]);
}

/** Count of tabs that match the query (cheap, for tests / instrumentation). */
export function countSearchHits(query: string, isAdmin = false): number {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return 0;
  const visible = isAdmin
    ? settingsRegistry
    : settingsRegistry.filter((t) => !t.requiresAdmin);
  return visible.filter((t) => {
    if (t.label.toLowerCase().includes(trimmed)) return true;
    if (t.description?.toLowerCase().includes(trimmed)) return true;
    return t.searchKeywords?.some((k) => k.toLowerCase().includes(trimmed));
  }).length;
}
