"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import {
  BottomSheet,
  BottomSheetBody,
} from "@/components/official/bottom-sheet/BottomSheet";
import { XTapButton } from "@/components/icons/tap-buttons";
import type {
  ShellNavChild,
  ShellNavItem,
} from "@/features/shell/constants/nav-data";
import {
  NAV_WINDOW_PANEL_ICON,
  partitionNavChildren,
} from "@/features/shell/constants/nav-data";
import { closeShellMobileMenu } from "@/features/shell/utils/closeShellMobileMenu";
import ShellIcon from "../ShellIcon";
import MobileRouteMenuSlot from "./MobileRouteMenuSlot";
import MobileSheetNavLink from "./MobileSheetNavLink";
import AdminMobileMenuItem from "../sidebar/admin-menu/AdminMobileMenuItem";

interface MobileNavigationDrawerProps {
  items: ShellNavItem[];
  settingsItem: ShellNavItem;
}

interface SearchResult {
  item: ShellNavItem | ShellNavChild;
  groupLabel?: string;
}

function mobileMenuControl(): HTMLInputElement | null {
  return document.getElementById("shell-mobile-menu") as HTMLInputElement | null;
}

function searchResults(items: ShellNavItem[], query: string): SearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];

  const results: SearchResult[] = [];
  for (const item of items) {
    const parentHaystack = `${item.label} ${item.description ?? ""}`.toLocaleLowerCase();
    if (parentHaystack.includes(needle)) results.push({ item });
    for (const child of item.children ?? []) {
      const childHaystack = `${child.label} ${child.description ?? ""} ${item.label}`.toLocaleLowerCase();
      if (childHaystack.includes(needle)) {
        results.push({ item: child, groupLabel: item.label });
      }
    }
  }
  return results;
}

function GroupButton({
  item,
  onOpen,
}: {
  item: ShellNavItem;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className="shell-mobile-nav-item w-full"
      onClick={onOpen}
      aria-label={`Open ${item.label} menu`}
    >
      <span className="shell-nav-icon">
        <ShellIcon name={item.iconName} size={20} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
      <ShellIcon
        name="ChevronRight"
        size={18}
        strokeWidth={1.75}
        className="shrink-0 text-muted-foreground"
      />
    </button>
  );
}

export default function MobileNavigationDrawer({
  items,
  settingsItem,
}: MobileNavigationDrawerProps) {
  const [open, setOpen] = useState(false);
  const [activeGroupHref, setActiveGroupHref] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const allItems = [...items, settingsItem];
  const activeGroup = allItems.find((item) => item.href === activeGroupHref);
  const results = searchResults(allItems, query);

  useEffect(() => {
    const control = mobileMenuControl();
    if (!control) return;

    const syncOpenState = () => {
      setOpen(control.checked);
      if (control.checked) {
        setActiveGroupHref(null);
        setQuery("");
      }
    };

    syncOpenState();
    control.addEventListener("change", syncOpenState);
    return () => control.removeEventListener("change", syncOpenState);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    const control = mobileMenuControl();
    if (control && control.checked !== nextOpen) control.checked = nextOpen;
    if (!nextOpen) {
      setActiveGroupHref(null);
      setQuery("");
    }
  };

  const renderChild = (child: ShellNavChild) => (
    <MobileSheetNavLink
      key={child.panelAction ?? child.action ?? child.href}
      href={child.href}
      iconName={child.panelAction ? NAV_WINDOW_PANEL_ICON : child.iconName}
      label={child.label}
      external={child.external}
    />
  );

  const renderRoot = () => (
    <div className="shell-mobile-main-nav" key="root">
      {items.map((item) =>
        item.children?.length ? (
          <GroupButton
            key={item.href}
            item={item}
            onOpen={() => setActiveGroupHref(item.href)}
          />
        ) : (
          <MobileSheetNavLink
            key={item.href}
            href={item.href}
            iconName={item.iconName}
            label={item.label}
            external={item.external}
            openInNewTab={item.openInNewTab}
          />
        ),
      )}

      <div className="shell-mobile-section-divider" />
      {settingsItem.children?.length ? (
        <GroupButton
          item={settingsItem}
          onOpen={() => setActiveGroupHref(settingsItem.href)}
        />
      ) : (
        <MobileSheetNavLink
          href={settingsItem.href}
          iconName={settingsItem.iconName}
          label={settingsItem.label}
        />
      )}
      <AdminMobileMenuItem />
    </div>
  );

  const renderGroup = (group: ShellNavItem) => {
    const { sections, panels, actions } = partitionNavChildren(group.children ?? []);
    return (
      <div className="shell-mobile-main-nav" key={group.href}>
        <MobileSheetNavLink
          href={group.href}
          iconName={group.iconName}
          label={`Open ${group.label}`}
          external={group.external}
          openInNewTab={group.openInNewTab}
        />

        {sections.map((section) => (
          <section key={section.label ?? section.items[0]?.href}>
            {section.label ? (
              <div className="shell-mobile-section-label">{section.label}</div>
            ) : null}
            {section.items.map(renderChild)}
          </section>
        ))}

        {panels.length ? (
          <section>
            <div className="shell-mobile-section-label">Windows</div>
            {panels.map(renderChild)}
          </section>
        ) : null}

        {actions.length ? (
          <section>
            <div className="shell-mobile-section-label">Create</div>
            {actions.map(renderChild)}
          </section>
        ) : null}
      </div>
    );
  };

  const renderSearch = () => (
    <div className="shell-mobile-main-nav" key="search-results">
      {results.length ? (
        results.map(({ item, groupLabel }) => (
          <MobileSheetNavLink
            key={`${groupLabel ?? "root"}-${item.href}-${item.label}`}
            href={item.href}
            iconName={item.iconName}
            label={item.label}
            contextLabel={groupLabel}
            external={item.external}
            openInNewTab={"openInNewTab" in item ? item.openInNewTab : false}
          />
        ))
      ) : (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          No destinations match “{query.trim()}”.
        </div>
      )}
    </div>
  );

  const title = query.trim()
    ? "Search"
    : activeGroup?.label ?? "Menu";
  const showBack = Boolean(activeGroup) && !query.trim();

  return (
    <BottomSheet
      open={open}
      onOpenChange={handleOpenChange}
      title="Navigation menu"
      size="full"
      surface="solid"
      contentClassName="shell-mobile-sheet"
    >
      <div className="shell-mobile-drawer-header">
        <button
          type="button"
          className="shell-mobile-back-button"
          onClick={() => setActiveGroupHref(null)}
          aria-label="Back to main menu"
          data-visible={showBack ? "true" : undefined}
          tabIndex={showBack ? 0 : -1}
        >
          <ShellIcon name="ChevronLeft" size={22} strokeWidth={1.75} />
          <span>Back</span>
        </button>
        <h2>{title}</h2>
        <XTapButton
          variant="transparent"
          ariaLabel="Close navigation menu"
          onClick={closeShellMobileMenu}
        />
      </div>

      {!activeGroup ? (
        <div className="shell-mobile-search-wrap">
          <Search aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search destinations"
            aria-label="Search menu destinations"
          />
        </div>
      ) : null}

      <BottomSheetBody className="shell-mobile-drawer-body">
        <nav aria-label="Mobile navigation">
          <MobileRouteMenuSlot />
          <div className="shell-mobile-view" key={query.trim() ? "search" : activeGroupHref ?? "root"}>
            {query.trim()
              ? renderSearch()
              : activeGroup
                ? renderGroup(activeGroup)
                : renderRoot()}
          </div>
          <div className="shell-mobile-route-nav" />
        </nav>
      </BottomSheetBody>
    </BottomSheet>
  );
}
