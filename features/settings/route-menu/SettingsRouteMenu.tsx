"use client";

import { useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Settings } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import {
  filterSettingsNavigationSections,
  SettingsFlatNavigation,
  SettingsNavigationSearch,
  settingsNavigationSections,
  type SettingsNavigationItem,
} from "@/components/official/settings/navigation/SettingsFlatNavigation";
import type { SettingsTreeNode } from "@/components/official/settings/tree/types";
import { useSettingsTree } from "@/features/settings/universal/useSettingsTree";
import { useSettingsControlSearch } from "@/features/settings/hooks/useSettingsSearch";
import {
  ROUTE_MENU_ICON_SIZE,
  ROUTE_MENU_ICON_STROKE_WIDTH,
  ROUTE_MENU_NAV_ITEM_CLASS,
} from "@/features/shell/constants/route-menu-style";
import { useMediaQuery } from "@/hooks/use-media-query";
import { SETTINGS_BASE, tabIdToHref, urlToTabId } from "../route-shell/routing";
import { isUserSettingsPath } from "../route-shell/settings-route-path";
import { findSettingsCategoryMatches, hasSettingsSearchResults } from "./search";

type SettingsRouteMenuProps = { expanded: boolean };

/** The settings large-route nav uses flat, always-visible desktop sections. */
export default function SettingsRouteMenu(_: SettingsRouteMenuProps) {
  const isRouteSheet = useMediaQuery("(max-width: 1023px)");
  const isAdmin = useAppSelector(selectIsAdmin);
  const { nodes } = useSettingsTree(isAdmin);
  const pathname = usePathname() ?? SETTINGS_BASE;
  const activeTabId = activeIdFromPath(pathname);

  return isRouteSheet ? (
    <SettingsMobileMenu nodes={nodes} activeTabId={activeTabId} isAdmin={isAdmin} />
  ) : (
    <SettingsDesktopMenu nodes={nodes} activeTabId={activeTabId} isAdmin={isAdmin} />
  );
}

function activeIdFromPath(pathname: string): string | null {
  if (!isUserSettingsPath(pathname)) return null;
  const rest = pathname.slice(SETTINGS_BASE.length).replace(/^\//, "");
  return rest ? urlToTabId(rest.split("/").filter(Boolean)) : null;
}

function SettingsDesktopMenu({
  nodes,
  activeTabId,
  isAdmin,
}: {
  nodes: SettingsTreeNode[];
  activeTabId: string | null;
  isAdmin: boolean;
}) {
  const [query, setQuery] = useState("");
  const controlResults = useSettingsControlSearch(query, isAdmin);
  const sections = filterSettingsNavigationSections(settingsNavigationSections(nodes), query);
  const hasResults = query.trim().length === 0 || controlResults.length > 0 || sections.length > 0;

  return (
    <nav className="settings-route-menu" aria-label="Settings">
      <Link
        href={SETTINGS_BASE}
        className={cn(ROUTE_MENU_NAV_ITEM_CLASS, "settings-route-menu-home", !activeTabId && "shell-active-pill")}
        aria-current={!activeTabId ? "page" : undefined}
      >
        <span className="shell-nav-icon"><Settings size={ROUTE_MENU_ICON_SIZE} strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH} /></span>
        <span className="settings-route-menu-label">Settings</span>
      </Link>
      <SettingsNavigationSearch value={query} onValueChange={setQuery} />
      <div className="settings-route-menu-tree">
        {query && controlResults.length > 0 ? <SettingsControlSearchResults results={controlResults} /> : null}
        {!hasResults ? (
          <p className="settings-route-menu-empty">No settings match.</p>
        ) : sections.length > 0 ? (
          <SettingsFlatNavigation
            sections={sections}
            activeId={activeTabId}
            renderItem={(item, active) => <FlatSettingsMenuLink item={item} active={active} />}
          />
        ) : null}
      </div>
    </nav>
  );
}

function FlatSettingsMenuLink({ item, active }: { item: SettingsNavigationItem; active: boolean }) {
  return <SettingsMenuLink node={item.node} label={item.label} active={active} />;
}

function SettingsMobileMenu({
  nodes,
  activeTabId,
  isAdmin,
}: {
  nodes: SettingsTreeNode[];
  activeTabId: string | null;
  isAdmin: boolean;
}) {
  const [parentId, setParentId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const controlResults = useSettingsControlSearch(query, isAdmin);
  const categoryResults = findSettingsCategoryMatches(nodes, query);
  const parent = parentId ? findNode(nodes, parentId) : null;
  const shown = parent?.children ?? nodes;

  return (
    <nav className="settings-route-menu settings-route-menu-mobile" aria-label="Settings">
      {parent ? (
        <button type="button" data-keep-mobile-menu-open className={cn(ROUTE_MENU_NAV_ITEM_CLASS, "settings-route-menu-back")} onClick={() => setParentId(findParentId(nodes, parent.id))}>
          <span className="shell-nav-icon"><ChevronLeft /></span><span className="settings-route-menu-label">Back</span>
        </button>
      ) : (
        <Link href={SETTINGS_BASE} className={ROUTE_MENU_NAV_ITEM_CLASS}><span className="shell-nav-icon"><Settings /></span><span className="settings-route-menu-label">Settings</span></Link>
      )}
      <SettingsNavigationSearch value={query} onValueChange={setQuery} />
      {query ? (
        hasSettingsSearchResults(query, controlResults, categoryResults) ? <>
          {controlResults.length > 0 ? <SettingsControlSearchResults results={controlResults} /> : null}
          {categoryResults.length > 0 ? <SettingsCategorySearchResults results={categoryResults} onOpenFolder={(id) => { setParentId(id); setQuery(""); }} /> : null}
        </> : <p className="settings-route-menu-empty">No settings match.</p>
      ) : shown.map((node) => {
        const Icon = node.icon;
        if (node.children?.length) {
          return <button key={node.id} type="button" data-keep-mobile-menu-open className={cn(ROUTE_MENU_NAV_ITEM_CLASS, "settings-route-menu-folder")} onClick={() => setParentId(node.id)}>
            <span className="shell-nav-icon">{Icon ? <Icon /> : <Settings />}</span><span className="settings-route-menu-label">{node.label}</span><ChevronRight className="ml-auto" aria-hidden />
          </button>;
        }
        return <SettingsMenuLink key={node.id} node={node} active={node.id === activeTabId} />;
      })}
    </nav>
  );
}

function SettingsMenuLink({ node, label = node.label, active }: { node: SettingsTreeNode; label?: string; active: boolean }) {
  return <Link href={tabIdToHref(SETTINGS_BASE, node.id)} prefetch aria-current={active ? "page" : undefined} className={cn(ROUTE_MENU_NAV_ITEM_CLASS, active && "shell-active-pill")}>
    <SettingsMenuLinkContent icon={node.icon} label={label} />
  </Link>;
}

function SettingsMenuLinkContent({ icon: Icon, label, description, location }: { icon?: SettingsTreeNode["icon"]; label: string; description?: string; location?: string }) {
  const { pending } = useLinkStatus();
  return <>
    <span className="shell-nav-icon">{Icon ? <Icon /> : <Settings />}</span>
    <span className="settings-route-menu-result-copy"><span className="settings-route-menu-label">{label}</span>{location ? <span className="settings-route-menu-location">{location}</span> : description ? <span className="settings-route-menu-description">{description}</span> : null}</span>
    {pending ? <Loader2 className="ml-auto animate-spin" aria-label={`Opening ${label}`} /> : null}
  </>;
}

function SettingsControlSearchResults({ results }: { results: ReturnType<typeof useSettingsControlSearch> }) {
  return <div className="settings-route-menu-results" aria-label="Exact setting results">
    {results.map((result) => <Link key={`${result.tabId}:${result.controlId ?? result.id}`} href={result.href} className={cn(ROUTE_MENU_NAV_ITEM_CLASS, "settings-route-menu-result")}>
      <SettingsMenuLinkContent label={result.label} location={result.location} />
    </Link>)}
  </div>;
}

function SettingsCategorySearchResults({ results, onOpenFolder }: { results: SettingsTreeNode[]; onOpenFolder: (id: string) => void }) {
  return <div className="settings-route-menu-results" aria-label="Section results">
    {results.map((node) => node.children?.length ? <button key={node.id} type="button" data-keep-mobile-menu-open className={cn(ROUTE_MENU_NAV_ITEM_CLASS, "settings-route-menu-result")} onClick={() => onOpenFolder(node.id)}>
      <SettingsMenuLinkContent icon={node.icon} label={node.label} description={node.description} /><ChevronRight className="ml-auto" aria-hidden />
    </button> : <SettingsMenuLink key={node.id} node={node} active={false} />)}
  </div>;
}

function findNode(nodes: SettingsTreeNode[], id: string): SettingsTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = node.children ? findNode(node.children, id) : null;
    if (found) return found;
  }
  return null;
}
function findParentId(nodes: SettingsTreeNode[], id: string, parentId: string | null = null): string | null {
  for (const node of nodes) {
    if (node.id === id) return parentId;
    if (node.children && containsNode(node.children, id)) return findParentId(node.children, id, node.id);
  }
  return null;
}
function containsNode(nodes: SettingsTreeNode[], id: string): boolean {
  return nodes.some((node) => node.id === id || Boolean(node.children && containsNode(node.children, id)));
}
