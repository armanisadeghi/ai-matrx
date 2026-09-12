"use client";

import { useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Settings,
  X,
} from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import type { SettingsTreeNode } from "@/components/official/settings/tree/types";
import {
  findAncestorPath,
  searchTree,
  withAncestors,
} from "@/components/official/settings/tree/types";
import { useSettingsTree } from "@/features/settings/universal/useSettingsTree";
import {
  ROUTE_MENU_ICON_SIZE,
  ROUTE_MENU_ICON_STROKE_WIDTH,
  ROUTE_MENU_NAV_ITEM_CLASS,
} from "@/features/shell/constants/route-menu-style";
import { useIsMobile } from "@/hooks/use-mobile";
import { SETTINGS_BASE, tabIdToHref, urlToTabId } from "../route-shell/routing";

type SettingsRouteMenuProps = { expanded: boolean };

/**
 * The settings family is a Large Route: this is rendered by RouteMenuSlot in
 * place of the app nav, and by MobileRouteMenuSlot in the existing push sheet.
 * It deliberately consumes the AppShell provider rather than mounting another
 * registry reader beside the route page.
 */
export default function SettingsRouteMenu(_: SettingsRouteMenuProps) {
  const isMobile = useIsMobile();
  const isAdmin = useAppSelector(selectIsAdmin);
  const { nodes } = useSettingsTree(isAdmin);
  const pathname = usePathname() ?? SETTINGS_BASE;
  const activeTabId = activeIdFromPath(pathname);

  return isMobile ? (
    <SettingsMobileMenu nodes={nodes} activeTabId={activeTabId} />
  ) : (
    <SettingsDesktopMenu nodes={nodes} activeTabId={activeTabId} />
  );
}

function activeIdFromPath(pathname: string): string | null {
  if (!pathname.startsWith(SETTINGS_BASE)) return null;
  const rest = pathname.slice(SETTINGS_BASE.length).replace(/^\//, "");
  return rest ? urlToTabId(rest.split("/").filter(Boolean)) : null;
}

function SettingsDesktopMenu({
  nodes,
  activeTabId,
}: {
  nodes: SettingsTreeNode[];
  activeTabId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const matches = query ? searchTree(nodes, query) : null;
  const visible = matches ? withAncestors(nodes, matches) : null;
  const activeAncestors = activeTabId
    ? findAncestorPath(nodes, activeTabId)
    : [];
  const expandedIds = new Set([
    ...expanded,
    ...activeAncestors,
    ...(visible ? [...visible] : []),
  ]);

  return (
    <div className="settings-route-menu">
      <Link
        href={SETTINGS_BASE}
        className={cn(
          ROUTE_MENU_NAV_ITEM_CLASS,
          "settings-route-menu-home",
          !activeTabId && "shell-active-pill",
        )}
        aria-current={!activeTabId ? "page" : undefined}
      >
        <span className="shell-nav-icon">
          <Settings
            size={ROUTE_MENU_ICON_SIZE}
            strokeWidth={ROUTE_MENU_ICON_STROKE_WIDTH}
          />
        </span>
        <span className="settings-route-menu-label">Settings</span>
      </Link>
      <div className="settings-route-menu-search">
        <Search aria-hidden className="settings-route-menu-search-icon" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search settings"
          aria-label="Search settings"
        />
        {query ? (
          <button
            type="button"
            className="settings-route-menu-clear"
            onClick={() => setQuery("")}
            aria-label="Clear search"
          >
            <X aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="settings-route-menu-tree">
        {visible?.size === 0 ? (
          <p className="settings-route-menu-empty">No settings match.</p>
        ) : (
          nodes.map((node) => (
            <DesktopTreeRow
              key={node.id}
              node={node}
              activeTabId={activeTabId}
              expandedIds={expandedIds}
              visible={visible}
              depth={0}
              onToggle={(id) =>
                setExpanded((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
            />
          ))
        )}
      </div>
    </div>
  );
}

function DesktopTreeRow({
  node,
  activeTabId,
  expandedIds,
  visible,
  depth,
  onToggle,
}: {
  node: SettingsTreeNode;
  activeTabId: string | null;
  expandedIds: Set<string>;
  visible: Set<string> | null;
  depth: number;
  onToggle: (id: string) => void;
}) {
  if (visible && !visible.has(node.id)) return null;
  const isFolder = Boolean(node.children?.length);
  const isOpen = isFolder && expandedIds.has(node.id);
  const Icon = node.icon;
  const indent = { paddingLeft: `${0.5 + depth * 0.75}rem` };

  if (isFolder) {
    return (
      <div>
        <button
          type="button"
          className={cn(
            ROUTE_MENU_NAV_ITEM_CLASS,
            "settings-route-menu-folder",
          )}
          style={indent}
          onClick={() => onToggle(node.id)}
          aria-expanded={isOpen}
        >
          <span className="shell-nav-icon">
            {isOpen ? <ChevronDown /> : <ChevronRight />}
          </span>
          {Icon ? <Icon className="settings-route-menu-node-icon" /> : null}
          <span className="settings-route-menu-label">{node.label}</span>
        </button>
        {isOpen
          ? node.children?.map((child) => (
              <DesktopTreeRow
                key={child.id}
                node={child}
                activeTabId={activeTabId}
                expandedIds={expandedIds}
                visible={visible}
                depth={depth + 1}
                onToggle={onToggle}
              />
            ))
          : null}
      </div>
    );
  }

  return (
    <SettingsMenuLink
      node={node}
      depth={depth}
      active={node.id === activeTabId}
    />
  );
}

function SettingsMobileMenu({
  nodes,
  activeTabId,
}: {
  nodes: SettingsTreeNode[];
  activeTabId: string | null;
}) {
  const [parentId, setParentId] = useState<string | null>(null);
  const parent = parentId ? findNode(nodes, parentId) : null;
  const shown = parent?.children ?? nodes;

  return (
    <div className="settings-route-menu settings-route-menu-mobile">
      {parent ? (
        <button
          type="button"
          data-keep-mobile-menu-open
          className={cn(ROUTE_MENU_NAV_ITEM_CLASS, "settings-route-menu-back")}
          onClick={() => setParentId(findParentId(nodes, parent.id))}
        >
          <span className="shell-nav-icon">
            <ChevronLeft />
          </span>
          <span className="settings-route-menu-label">Back</span>
        </button>
      ) : (
        <Link href={SETTINGS_BASE} className={ROUTE_MENU_NAV_ITEM_CLASS}>
          <span className="shell-nav-icon">
            <Settings />
          </span>
          <span className="settings-route-menu-label">Settings</span>
        </Link>
      )}
      {shown.map((node) => {
        const hasChildren = Boolean(node.children?.length);
        const Icon = node.icon;
        if (hasChildren) {
          return (
            <button
              key={node.id}
              type="button"
              data-keep-mobile-menu-open
              className={cn(
                ROUTE_MENU_NAV_ITEM_CLASS,
                "settings-route-menu-folder",
              )}
              onClick={() => setParentId(node.id)}
            >
              <span className="shell-nav-icon">
                {Icon ? <Icon /> : <Settings />}
              </span>
              <span className="settings-route-menu-label">{node.label}</span>
              <ChevronRight className="ml-auto" aria-hidden />
            </button>
          );
        }
        return (
          <SettingsMenuLink
            key={node.id}
            node={node}
            active={node.id === activeTabId}
          />
        );
      })}
    </div>
  );
}

function SettingsMenuLink({
  node,
  active,
  depth = 0,
}: {
  node: SettingsTreeNode;
  active: boolean;
  depth?: number;
}) {
  const Icon = node.icon;
  const { pending } = useLinkStatus();
  return (
    <Link
      href={tabIdToHref(SETTINGS_BASE, node.id)}
      prefetch
      aria-current={active ? "page" : undefined}
      className={cn(ROUTE_MENU_NAV_ITEM_CLASS, active && "shell-active-pill")}
      style={{ paddingLeft: `${0.5 + depth * 0.75 + 1.25}rem` }}
    >
      <span className="shell-nav-icon">{Icon ? <Icon /> : <Settings />}</span>
      <span className="settings-route-menu-label">{node.label}</span>
      {pending ? (
        <Loader2
          className="ml-auto animate-spin"
          aria-label={`Opening ${node.label}`}
        />
      ) : null}
    </Link>
  );
}

function findNode(
  nodes: SettingsTreeNode[],
  id: string,
): SettingsTreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const found = node.children ? findNode(node.children, id) : null;
    if (found) return found;
  }
  return null;
}

function findParentId(
  nodes: SettingsTreeNode[],
  id: string,
  parentId: string | null = null,
): string | null {
  for (const node of nodes) {
    if (node.id === id) return parentId;
    if (node.children && containsNode(node.children, id)) {
      return findParentId(node.children, id, node.id);
    }
  }
  return null;
}

function containsNode(nodes: SettingsTreeNode[], id: string): boolean {
  return nodes.some(
    (node) =>
      node.id === id ||
      (node.children ? containsNode(node.children, id) : false),
  );
}
