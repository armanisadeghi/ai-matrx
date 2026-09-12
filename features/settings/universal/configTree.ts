// features/settings/universal/configTree.ts
//
// Turns the registry-driven domains (from UniversalSettingsProvider) into the
// SAME tree nodes and tab definitions the static settings registry produces,
// so the tree, breadcrumb, search, drawer and route all treat a taxonomy
// section exactly like a hand-written tab. One settings surface, not two.
//
// Ids: `config` (root folder) › `config.<domain>` (folder) › `config.<domain>.<feature>`
// (leaf). Domain-level keys (filed on the domain node itself) get a leaf named
// after the domain. Segments are camelCase forms of the registry slugs so the
// existing URL translation (`routing.ts`: kebab ↔ camel) round-trips them.

import { SlidersHorizontal } from "lucide-react";
import type { SettingsTreeNode } from "@/components/official/settings/tree/types";
import type { SettingsTabDef } from "../types";
import UniversalSettingsPane from "./UniversalSettingsPane";
import {
  CONFIG_TAB_ROOT,
  type SettingsDomain,
  type SettingsFeatureSection,
} from "./UniversalSettingsContext";

/** Label of the root folder every taxonomy-driven section hangs under. */
export const CONFIG_TAB_LABEL = "Configuration";

export function isConfigTabId(tabId: string | null | undefined): boolean {
  return Boolean(tabId && (tabId === CONFIG_TAB_ROOT || tabId.startsWith(`${CONFIG_TAB_ROOT}.`)));
}

/** Tree nodes for the nav — only domains and features that actually have keys. */
export function buildConfigTreeNodes(domains: SettingsDomain[]): SettingsTreeNode[] {
  if (domains.length === 0) return [];
  return [
    {
      id: CONFIG_TAB_ROOT,
      label: CONFIG_TAB_LABEL,
      icon: SlidersHorizontal,
      description:
        "Every platform setting your organization or you may change, by domain — each one says where its value comes from.",
      searchKeywords: ["configuration", "knob", "override", "organization", "platform", "policy"],
      children: domains.map((domain) => ({
        id: domain.id,
        label: domain.name,
        description: `${countKeys(domain)} setting${countKeys(domain) === 1 ? "" : "s"}`,
        searchKeywords: domain.features.flatMap((f) => f.knobs.map((k) => k.label)),
        children: [
          ...(domain.domainLeafId
            ? [
                {
                  id: domain.domainLeafId,
                  label: domain.name,
                  description: `Settings that apply across ${domain.name}.`,
                  searchKeywords: domain.knobs.map((k) => k.label),
                },
              ]
            : []),
          ...domain.features.map((feature) => ({
            id: feature.id,
            label: feature.name,
            description: `${feature.knobs.length} setting${feature.knobs.length === 1 ? "" : "s"}`,
            searchKeywords: feature.knobs.flatMap((k) => [k.label, k.full_key]),
          })),
        ],
      })),
    },
  ];
}

function countKeys(domain: SettingsDomain): number {
  return domain.knobs.length + domain.features.reduce((n, f) => n + f.knobs.length, 0);
}

export type ResolvedConfigSection = {
  domain: SettingsDomain;
  /** Null when the leaf is the domain-level section. */
  feature: SettingsFeatureSection | null;
  knobs: SettingsFeatureSection["knobs"];
  title: string;
};

/** The section a `config.*` leaf id points at, or null when it names nothing. */
export function resolveConfigSection(
  tabId: string,
  domains: SettingsDomain[],
): ResolvedConfigSection | null {
  for (const domain of domains) {
    if (domain.domainLeafId === tabId) {
      return { domain, feature: null, knobs: domain.knobs, title: domain.name };
    }
    const feature = domain.features.find((f) => f.id === tabId);
    if (feature) {
      return { domain, feature, knobs: feature.knobs, title: feature.name };
    }
  }
  return null;
}

/**
 * A `SettingsTabDef` for a `config.*` leaf so `SettingsTabHost` renders it like
 * any registry tab. The pane reads which section it is from the active-tab
 * context the host provides (a tab component takes no props).
 */
export function configTabDef(tabId: string, domains: SettingsDomain[]): SettingsTabDef | null {
  const section = resolveConfigSection(tabId, domains);
  if (!section) return null;
  return {
    id: tabId,
    label: section.title,
    icon: SlidersHorizontal,
    parentId: section.domain.id,
    description: section.feature
      ? `${section.domain.name} › ${section.feature.name}`
      : `Settings that apply across ${section.domain.name}.`,
    component: UniversalSettingsPane,
    persistence: "server",
  };
}
