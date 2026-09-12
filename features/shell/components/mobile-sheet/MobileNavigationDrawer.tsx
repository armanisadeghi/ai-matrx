"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import AppLink from "@/components/navigation/AppLink";
import { BottomSheet, BottomSheetBody } from "@ai-matrx/design-system";
import { XTapButton } from "@ai-matrx/tap-target/buttons";
import type {
  ShellNavChild,
  ShellNavItem,
} from "@/features/shell/constants/nav-data";
import {
  NAV_WINDOW_PANEL_ICON,
  partitionNavChildren,
} from "@/features/shell/constants/nav-data";
import { closeShellMobileMenu } from "@/features/shell/utils/closeShellMobileMenu";
import { useNavActions } from "@/features/shell/navigation/navActions";
import { useNavPanelActions } from "@/features/shell/navigation/navPanelActions";
import ShellIcon from "../ShellIcon";
import MobileRouteMenuSlot from "./MobileRouteMenuSlot";
import MobileSheetNavLink from "./MobileSheetNavLink";
import AdminMobileMenuItem from "../sidebar/admin-menu/AdminMobileMenuItem";
import { isUserSettingsPath } from "@/features/settings/route-shell/settings-route-path";

interface MobileNavigationDrawerProps {
  items: ShellNavItem[];
  settingsItem: ShellNavItem;
}

interface SearchResult {
  item: ShellNavItem | ShellNavChild;
  groupLabel?: string;
}

function mobileMenuControl(): HTMLInputElement | null {
  return document.getElementById(
    "shell-mobile-menu",
  ) as HTMLInputElement | null;
}

function navItemIdentity(item: ShellNavItem): string {
  return `${item.href}::${item.label}`;
}

function navChildIdentity(child: ShellNavChild): string {
  return `${child.panelAction ?? child.action ?? child.href}::${child.label}`;
}

function searchResults(items: ShellNavItem[], query: string): SearchResult[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];

  const results: SearchResult[] = [];
  for (const item of items) {
    const parentHaystack = [item.label, item.description]
      .filter((part): part is string => typeof part === "string")
      .join(" ")
      .toLocaleLowerCase();
    if (parentHaystack.includes(needle)) results.push({ item });
    for (const child of item.children ?? []) {
      const childHaystack = [child.label, child.description, item.label]
        .filter((part): part is string => typeof part === "string")
        .join(" ")
        .toLocaleLowerCase();
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
  const pathname = usePathname();
  const isActive =
    pathname === item.href || pathname?.startsWith(`${item.href}/`) === true;
  const closeAfterNavigationStarts = () => {
    window.setTimeout(closeShellMobileMenu, 0);
  };
  const className = "shell-mobile-nav-item shell-mobile-group-link";
  const content = (
    <>
      <span className="shell-nav-icon">
        <ShellIcon name={item.iconName} size={20} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1 truncate text-left">{item.label}</span>
    </>
  );

  return (
    <div
      className="shell-mobile-nav-group"
      data-active={isActive ? "true" : undefined}
    >
      {item.external || item.openInNewTab ? (
        <a
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className={className}
          onClick={closeAfterNavigationStarts}
        >
          {content}
        </a>
      ) : (
        <AppLink
          href={item.href}
          className={className}
          data-nav-href={item.href}
          data-active={isActive ? "true" : undefined}
          aria-current={isActive ? "page" : undefined}
          onClick={closeAfterNavigationStarts}
        >
          {content}
        </AppLink>
      )}
      <button
        type="button"
        className="shell-mobile-group-disclosure"
        onClick={onOpen}
        aria-label={`Open ${item.label} menu`}
      >
        <ShellIcon
          name="ChevronRight"
          size={18}
          strokeWidth={1.75}
          className="shrink-0 text-muted-foreground"
        />
      </button>
    </div>
  );
}

export default function MobileNavigationDrawer({
  items,
  settingsItem,
}: MobileNavigationDrawerProps) {
  const [open, setOpen] = useState(false);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const navActions = useNavActions();
  const navPanelActions = useNavPanelActions();
  const pathname = usePathname() ?? "";
  const settingsRoute = isUserSettingsPath(pathname);

  const allItems = [...items, settingsItem];
  const activeGroup = allItems.find(
    (item) => navItemIdentity(item) === activeGroupId,
  );
  const results = searchResults(allItems, query);

  useEffect(() => {
    const control = mobileMenuControl();
    if (!control) return;
    let openFrame: number | null = null;

    const syncOpenState = () => {
      if (control.checked) {
        // The checkbox changes during the hamburger's pointer sequence. Mount
        // Vaul on the next frame so that same pointer-up cannot dismiss the
        // drawer as an outside interaction immediately after opening it.
        openFrame = window.requestAnimationFrame(() => {
          setActiveGroupId(null);
          setQuery("");
          setOpen(true);
          openFrame = null;
        });
      } else {
        if (openFrame != null) window.cancelAnimationFrame(openFrame);
        openFrame = null;
        setOpen(false);
      }
    };

    syncOpenState();
    control.addEventListener("change", syncOpenState);
    return () => {
      if (openFrame != null) window.cancelAnimationFrame(openFrame);
      control.removeEventListener("change", syncOpenState);
    };
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    const control = mobileMenuControl();
    if (control && control.checked !== nextOpen) control.checked = nextOpen;
    if (!nextOpen) {
      setActiveGroupId(null);
      setQuery("");
    }
  };

  const renderChild = (child: ShellNavChild) => {
    const handler = child.panelAction
      ? navPanelActions[child.panelAction]
      : child.action
        ? navActions[child.action]
        : undefined;
    if (handler) {
      return (
        <button
          key={navChildIdentity(child)}
          type="button"
          className="shell-mobile-nav-item w-full"
          onClick={() => {
            handler();
            closeShellMobileMenu();
          }}
        >
          <span className="shell-nav-icon">
            <ShellIcon
              name={child.panelAction ? NAV_WINDOW_PANEL_ICON : child.iconName}
              size={20}
              strokeWidth={1.75}
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-left">
            {child.label}
          </span>
        </button>
      );
    }
    return (
      <MobileSheetNavLink
        key={navChildIdentity(child)}
        href={child.href}
        iconName={child.iconName}
        label={child.label}
        external={child.external}
      />
    );
  };

  const renderRoot = () => (
    <div className="shell-mobile-main-nav" key="root">
      {items.map((item) =>
        item.children?.length ? (
          <GroupButton
            key={navItemIdentity(item)}
            item={item}
            onOpen={() => setActiveGroupId(navItemIdentity(item))}
          />
        ) : (
          <MobileSheetNavLink
            key={navItemIdentity(item)}
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
          onOpen={() => setActiveGroupId(navItemIdentity(settingsItem))}
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
    const { sections, panels, actions } = partitionNavChildren(
      group.children ?? [],
    );
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
        results.map(({ item, groupLabel }) =>
          "panelAction" in item || "action" in item ? (
            renderChild(item as ShellNavChild)
          ) : (
            <MobileSheetNavLink
              key={`${groupLabel ?? "root"}-${item.href}-${item.label}`}
              href={item.href}
              iconName={item.iconName}
              label={item.label}
              contextLabel={groupLabel}
              external={item.external}
              openInNewTab={"openInNewTab" in item ? item.openInNewTab : false}
            />
          ),
        )
      ) : (
        <div className="px-4 py-12 text-center text-sm text-muted-foreground">
          No destinations match “{query.trim()}”.
        </div>
      )}
    </div>
  );

  // The settings Large Route supplies its own control search in the routed
  // menu. Ignore any global-menu query while that route is active so its
  // hidden main-nav search view cannot take over the sheet.
  const activeQuery = settingsRoute ? "" : query;
  const title = activeQuery.trim() ? "Search" : (activeGroup?.label ?? "Menu");
  const showBack = Boolean(activeGroup) && !activeQuery.trim();

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
          onClick={() => setActiveGroupId(null)}
          aria-label="Back to main menu"
          aria-hidden={!showBack}
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

      {!activeGroup && !settingsRoute ? (
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
          <div
            className="shell-mobile-view"
            key={activeQuery.trim() ? "search" : (activeGroupId ?? "root")}
          >
            {activeQuery.trim()
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
