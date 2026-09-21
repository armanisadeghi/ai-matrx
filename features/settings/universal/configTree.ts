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
import type { ScopedKnob } from "@/lib/scoped-config/types";
import type { SettingsTabDef } from "../types";
import UniversalSettingsPane from "./UniversalSettingsPane";
import { SETTINGS_BASE, tabIdToHref } from "../route-shell/routing";
import {
  CONFIG_TAB_ROOT,
  slugToTabSegment,
  type SettingsDomain,
  type SettingsFeatureSection,
} from "./UniversalSettingsContext";

/** Label of the root folder every taxonomy-driven section hangs under. */
export const CONFIG_TAB_LABEL = "Configuration";

/**
 * 🚨 THE DOOR TO THE VIEWER'S OWN COPY OF ONE SETTING (feedback 7dc1e5ae).
 *
 * A row that says "your own setting overrides this for you" and offers no way
 * to reach that setting has told a person about a door and then hidden it —
 * which is the second half of the same defect. The personal configuration
 * surface renders every key whose `overridable_by` names `user`, filed under
 * the same taxonomy node, and `SettingsRow` anchors each row at its full key,
 * so the address is derivable: the section's tab id plus `#<full_key>`.
 *
 * `null` when the key is NOT reachable there — unfiled (the left nav has
 * nowhere to put it) or not opened to people at all. A door that would land on
 * a page without the control is worse than no door.
 */
export function personalKnobHref(
  knob: ScopedKnob,
  /**
   * 🚨 REQUIRED, AND THE REASON THE DOOR IS HONEST. A personal value is
   * qualified by an organization — the same person holds a different value for
   * this key in each one — so a door that dropped the organization would land
   * on a DIFFERENT value than the one doing the masking. `null` closes the
   * door rather than opening a misleading one.
   */
  organizationId: string | null,
): string | null {
  if (!knob.overridable_by.includes("user")) return null;
  if (!organizationId) return null;
  const filed = knob.taxonomy;
  if (!filed?.domain_slug) return null;
  const domain = slugToTabSegment(filed.domain_slug);
  const leaf = filed.feature_slug ? slugToTabSegment(filed.feature_slug) : domain;
  const path = tabIdToHref(SETTINGS_BASE, `${CONFIG_TAB_ROOT}.${domain}.${leaf}`);
  return `${path}?org=${encodeURIComponent(organizationId)}#${encodeURIComponent(knob.full_key)}`;
}

export function isConfigTabId(tabId: string | null | undefined): boolean {
  return Boolean(tabId && (tabId === CONFIG_TAB_ROOT || tabId.startsWith(`${CONFIG_TAB_ROOT}.`)));
}

/** Tree nodes for the nav — every canonical domain and feature is visible. */
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
        description: sectionCountDescription(countKeys(domain)),
        searchKeywords: domain.features.flatMap((f) => f.knobs.map((k) => k.label)),
        children: [
          ...(domain.domainLeafId
            ? [
                {
                  id: domain.domainLeafId,
                  label: "Overview",
                  description: domain.knobs.length > 0
                    ? `Settings that apply across ${domain.name}.`
                    : `Browse ${domain.name} settings and coverage.`,
                  searchKeywords: domain.knobs.map((k) => k.label),
                },
              ]
            : []),
          ...domain.features.map((feature) => ({
            id: feature.id,
            label: feature.name,
            description: sectionCountDescription(feature.knobs.length),
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

function sectionCountDescription(count: number): string {
  return count === 0
    ? "No controls registered yet"
    : `${count} setting${count === 1 ? "" : "s"}`;
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
