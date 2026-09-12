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
    <div className="sticky top-0 z-10 my-1 bg-background py-0.5" role="search">
      <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={label}
        aria-label={label}
        className="h-8 w-full rounded-md border border-border bg-background px-7 text-[0.8125rem] text-foreground shadow-sm outline-none focus:border-ring focus:outline-2 focus:outline-ring/20 focus:outline-offset-1"
      />
      {value ? <button type="button" className="absolute right-1.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" onClick={() => onValueChange("")} aria-label="Clear search"><X aria-hidden /></button> : null}
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
      if (last && !last.label) {
        last.items.push(asItem(root, "Settings"));
      } else {
        sections.push({ id: `unsectioned:${root.id}`, items: [asItem(root, "Settings")] });
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
  /** Return one native interactive root (`a` or `button`); this primitive owns its row styling. */
  renderItem: (item: SettingsNavigationItem, active: boolean) => ReactNode;
  empty?: ReactNode;
}) {
  if (sections.length === 0) {
    return <div className="px-3 py-6 text-sm text-muted-foreground">{empty ?? "No settings match."}</div>;
  }
  return (
    <div className="flex flex-col gap-3 py-1">
      {sections.map((section) => (
        <section key={section.id} className="flex flex-col gap-0.5" aria-label={section.label ?? "Settings"}>
          {section.label ? <h2 className={cn("m-0 px-2 py-1 text-xs font-medium leading-5 text-muted-foreground", section.id === activeId && "rounded bg-muted text-foreground")}>{section.label}</h2> : null}
          <div className="flex flex-col gap-px">
            {section.items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "[&>a]:flex [&>a]:min-h-[1.875rem] [&>a]:w-full [&>a]:items-center [&>a]:rounded-sm [&>a]:pl-2 [&>a]:text-[0.8125rem] [&>button]:flex [&>button]:min-h-[1.875rem] [&>button]:w-full [&>button]:items-center [&>button]:rounded-sm [&>button]:pl-2 [&>button]:text-[0.8125rem]",
                  item.id === activeId && "[&>a]:bg-muted [&>a]:text-foreground [&>button]:bg-muted [&>button]:text-foreground",
                )}
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
