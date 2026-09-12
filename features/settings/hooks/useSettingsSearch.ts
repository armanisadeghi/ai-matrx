"use client";

import { settingsRegistry, getVisibleTabs } from "../registry";
import type { SettingsTabDef } from "../types";
import { useUniversalSettings } from "../universal/UniversalSettingsContext";
import { staticSettingsControlIndex } from "../static-control-index";
import { SETTINGS_BASE, tabIdToHref } from "../route-shell/routing";
import {
  dedupeSettingsControlSearchHits,
  type SettingsControlSearchHit,
} from "../search/controlSearch";

export type SettingsSearchHit = {
  tab: SettingsTabDef;
  matchedIn: "label" | "description" | "keyword";
  matchText: string;
};

/** Exact-control search for the route shell, with a visible destination path. */
export function useSettingsControlSearch(
  query: string,
  isAdmin: boolean,
): SettingsControlSearchHit[] {
  const { knobs, domains } = useUniversalSettings();
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];

  const visibleTabIds = new Set(getVisibleTabs(isAdmin).map((tab) => tab.id));
  const staticHits: SettingsControlSearchHit[] = staticSettingsControlIndex
    .filter((control) => visibleTabIds.has(control.tabId))
    .filter((control) =>
      [control.label, control.description]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLowerCase().includes(trimmed)),
    )
    .map((control) => ({
      id: `static:${control.controlId}`,
      label: control.label,
      description: control.description,
      location: tabLocation(control.tabId),
      tabId: control.tabId,
      controlId: control.controlId,
      href: `${tabIdToHref(SETTINGS_BASE, control.tabId)}?control=${encodeURIComponent(control.controlId)}`,
    }));

  const sections = domains.flatMap((domain) => [
    ...(domain.domainLeafId === null
      ? []
      : [{ id: domain.domainLeafId, knobs: domain.knobs, location: `Configuration / ${domain.name}` }]),
    ...domain.features.map((feature) => ({
      ...feature,
      location: `Configuration / ${domain.name} / ${feature.name}`,
    })),
  ]);
  const controls: SettingsControlSearchHit[] = knobs.flatMap((knob) => {
    const section = sections.find((candidate) =>
      candidate.knobs.some((item) => item.full_key === knob.full_key),
    );
    const haystack = [knob.full_key, knob.label, knob.description, knob.ui.help]
      .filter((value): value is string => typeof value === "string")
      .join(" ")
      .toLowerCase();
    if (!section || !haystack.includes(trimmed)) return [];
    return [{
      id: knob.full_key,
      label: knob.label,
      description: knob.description || undefined,
      location: section.location,
      tabId: section.id,
      controlId: knob.full_key,
      href: `${tabIdToHref(SETTINGS_BASE, section.id)}?control=${encodeURIComponent(knob.full_key)}`,
    }];
  });
  return dedupeSettingsControlSearchHits([...staticHits, ...controls]);
}

function tabLocation(tabId: string): string {
  const labels: string[] = [];
  let tab = settingsRegistry.find((candidate) => candidate.id === tabId);
  while (tab) {
    labels.unshift(tab.label);
    const parentId = tab.parentId;
    tab = parentId
      ? settingsRegistry.find((candidate) => candidate.id === parentId)
      : undefined;
  }
  return ["Settings", ...labels].join(" / ");
}

/** Searches the visible registry by label, keyword, then description. */
export function useSettingsSearch(
  query: string,
  options?: { isAdmin?: boolean },
): SettingsSearchHit[] {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return [];
  const byLabel: SettingsSearchHit[] = [];
  const byKeyword: SettingsSearchHit[] = [];
  const byDescription: SettingsSearchHit[] = [];

  for (const tab of getVisibleTabs(options?.isAdmin ?? false)) {
    if (tab.label.toLowerCase().includes(trimmed)) {
      byLabel.push({ tab, matchedIn: "label", matchText: trimmed });
      continue;
    }
    const keyword = tab.searchKeywords?.find((value) =>
      value.toLowerCase().includes(trimmed),
    );
    if (keyword) {
      byKeyword.push({ tab, matchedIn: "keyword", matchText: keyword });
      continue;
    }
    if (tab.description?.toLowerCase().includes(trimmed)) {
      byDescription.push({ tab, matchedIn: "description", matchText: trimmed });
    }
  }
  return [...byLabel, ...byKeyword, ...byDescription];
}

export function countSearchHits(query: string, isAdmin = false): number {
  const trimmed = query.trim().toLowerCase();
  if (!trimmed) return 0;
  const visible = isAdmin
    ? settingsRegistry
    : settingsRegistry.filter((tab) => !tab.requiresAdmin);
  return visible.filter((tab) => {
    if (tab.label.toLowerCase().includes(trimmed)) return true;
    if (tab.description?.toLowerCase().includes(trimmed)) return true;
    return tab.searchKeywords?.some((keyword) => keyword.toLowerCase().includes(trimmed));
  }).length;
}
