"use client";

import type { ReactNode, Ref } from "react";
import { Search, X } from "lucide-react";
import type { SettingsTreeNode } from "@/components/official/settings/tree/types";
import { cn } from "@/lib/utils";

export function SettingsNavigationSearch({
  value,
  onValueChange,
  label = "Search settings",
  inputRef,
}: {
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <div className="settings-route-menu-search" role="search">
      <Search aria-hidden className="settings-route-menu-search-icon" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={label}
        aria-label={label}
      />
      {value ? <button type="button" className="settings-route-menu-clear" onClick={() => onValueChange("")} aria-label="Clear search"><X aria-hidden /></button> : null}
    </div>
  );
}

export type SettingsNavigationItem = {
  id: string;
  label: string;
  location: string;
  node: SettingsTreeNode;
};

export type SettingsNavigationSection = {
  id: string;
  /** Omit when adjacent root links do not have a meaningful shared heading. */
  label?: string;
  items: SettingsNavigationItem[];
};

/**
 * Converts a settings tree into Notion-style, non-recursive sections. Desktop
 * navigation intentionally has no expandable state: headings orient people and
 * every destination stays visible as a flat link.
 */
export function settingsNavigationSections(
  nodes: SettingsTreeNode[],
): SettingsNavigationSection[] {
  const sections: SettingsNavigationSection[] = [];
  for (const root of nodes) {
    if (!root.children?.length) {
      const last = sections.at(-1);
      if (last?.id === "unsectioned") {
        last.items.push(asItem(root, "Settings"));
      } else {
        sections.push({ id: "unsectioned", items: [asItem(root, "Settings")] });
      }
      continue;
    }

    // Registry folders are headings. Configuration domains use their routable
    // Overview child while keeping the domain's human name in the flat list.
    const items: SettingsNavigationItem[] = [];
    const collect = (node: SettingsTreeNode, path: string[]): void => {
      if (!node.children?.length) {
        items.push(asItem(node, path.join(" / ")));
        return;
      }

      const overview = node.children.find((child) => child.label === "Overview");
      if (overview) {
        items.push(asItem({ ...overview, label: node.label }, [...path, node.label].join(" / ")));
        return;
      }
      for (const child of node.children) collect(child, [...path, node.label]);
    };
    for (const child of root.children) collect(child, [root.label]);
    if (items.length) sections.push({ id: root.id, label: root.label, items });
  }
  return sections;
}

function asItem(node: SettingsTreeNode, location: string): SettingsNavigationItem {
  return { id: node.id, label: node.label, location, node };
}

export function filterSettingsNavigationSections(
  sections: SettingsNavigationSection[],
  query: string,
): SettingsNavigationSection[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return sections;
  return sections.flatMap((section) => {
    const items = section.items.filter((item) =>
      [item.label, item.location, item.node.description, ...(item.node.searchKeywords ?? [])]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .toLocaleLowerCase()
        .includes(needle),
    );
    return items.length ? [{ ...section, items }] : [];
  });
}

export function SettingsFlatNavigation({
  sections,
  activeId,
  renderItem,
  empty,
}: {
  sections: SettingsNavigationSection[];
  activeId: string | null;
  renderItem: (item: SettingsNavigationItem, active: boolean) => ReactNode;
  empty?: ReactNode;
}) {
  if (sections.length === 0) {
    return <div className="px-3 py-6 text-sm text-muted-foreground">{empty ?? "No settings match."}</div>;
  }
  return (
    <div className="settings-flat-navigation">
      {sections.map((section) => (
        <section key={section.id} className="settings-flat-navigation-section" aria-label={section.label ?? "Settings"}>
          {section.label ? <h2 className={cn("settings-flat-navigation-heading", section.id === activeId && "settings-flat-navigation-heading-active")}>{section.label}</h2> : null}
          <div className="settings-flat-navigation-items">
            {section.items.map((item) => (
              <div
                key={item.id}
                className={cn("settings-flat-navigation-item", item.id === activeId && "settings-flat-navigation-item-active")}
              >
                {renderItem(item, item.id === activeId)}
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
