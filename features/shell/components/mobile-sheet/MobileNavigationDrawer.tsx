"use client";

import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import AppLink from "@/components/navigation/AppLink";
import { BottomSheet, BottomSheetBody } from "@ai-matrx/design-system";
import { XTapButton } from "@ai-matrx/design-system/tap-target/buttons";
import type {
  ShellNavChild,
  ShellNavItem,
} from "@/features/shell/constants/nav-data";
import {
  NAV_WINDOW_PANEL_ICON,
  navToneIconClass,
  partitionNavChildren,
} from "@/features/shell/constants/nav-data";
import { cn } from "@/lib/utils";
import { closeShellMobileMenu } from "@/features/shell/utils/closeShellMobileMenu";
import { useNavActions } from "@/features/shell/navigation/navActions";
import { useNavPanelActions } from "@/features/shell/navigation/navPanelActions";
import ShellIcon from "../ShellIcon";
import MobileRouteMenuSlot from "./MobileRouteMenuSlot";
import MobileSheetNavLink from "./MobileSheetNavLink";
import AdminMobileMenuItem from "../sidebar/admin-menu/AdminMobileMenuItem";
import MobileDrawerUserRow from "../user-block/MobileDrawerUserRow";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { ShellSettingsMenu } from "../account-rail/ShellSettingsMenu";
import { ShellOrgSwitcher } from "../account-rail/ShellOrgSwitcher";
import { isUserSettingsPath } from "@/features/settings/route-shell/settings-route-path";
import { searchNavDestinations } from "@/features/shell/utils/search-nav";
import {
  findActiveNavBranch,
  findActiveNavChild,
  isExclusiveNavGroupActive,
  isOnRoute,
} from "@/features/shell/utils/is-nav-group-active";

interface MobileNavigationDrawerProps {
  items: ShellNavItem[];
  settingsItem: ShellNavItem;
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

/** A menu row that both navigates (its name) and drills in (its chevron). */
type DrillNode = Pick<ShellNavItem, "label" | "href" | "iconName" | "tone"> & {
  external?: boolean;
  openInNewTab?: boolean;
};

function GroupButton({
  item,
  isActive,
  onOpen,
}: {
  item: DrillNode;
  isActive: boolean;
  onOpen: () => void;
}) {
  const closeAfterNavigationStarts = () => {
    window.setTimeout(closeShellMobileMenu, 0);
  };
  const className = "shell-mobile-nav-item shell-mobile-group-link";
  const content = (
    <>
      <span className={cn("shell-nav-icon", navToneIconClass(item.tone))}>
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
  /** The sub-area drilled into inside the active group (the third level). */
  const [activeSubId, setActiveSubId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const navActions = useNavActions();
  const navPanelActions = useNavPanelActions();
  const pathname = usePathname() ?? "";
  // Gated destinations (Make, Records) appear where their switch is on.
  const settingsRoute = isUserSettingsPath(pathname);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  const allItems = [...items, settingsItem];
  const activeGroup = allItems.find(
    (item) => navItemIdentity(item) === activeGroupId,
  );
  const activeSub = activeGroup?.children?.find(
    (child) =>
      (child.children?.length ?? 0) > 0 &&
      navChildIdentity(child) === activeSubId,
  );
  const results = searchNavDestinations(allItems, query);

  useEffect(() => {
    const control = mobileMenuControl();
    if (!control) return;
    let openFrame: number | null = null;

    const syncOpenState = () => {
      // The hamburger is a <label> for this aria-hidden checkbox, so a tap
      // leaves focus ON it; the sheet then aria-hides the page around a
      // focused element ("Blocked aria-hidden…", phone run PB-08 #2).
      if (document.activeElement === control) control.blur();
      if (control.checked) {
        // The checkbox changes during the hamburger's pointer sequence. Mount
        // Vaul on the next frame so that same pointer-up cannot dismiss the
        // drawer as an outside interaction immediately after opening it.
        openFrame = window.requestAnimationFrame(() => {
          setActiveGroupId(null);
          setActiveSubId(null);
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
      setActiveSubId(null);
      setQuery("");
    }
  };

  const renderChild = (child: ShellNavChild, active?: boolean) => {
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
        openInNewTab={child.openInNewTab}
        exact={child.exact}
        active={active}
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
            isActive={isExclusiveNavGroupActive(pathname, item, allItems)}
            onOpen={() => {
              setActiveSubId(null);
              setActiveGroupId(navItemIdentity(item));
            }}
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

      <AdminMobileMenuItem />
    </div>
  );

  /* THE ACCOUNT RAIL, phone edition — the same three the desktop rail keeps
     always visible (ShellUserBlock): the person, the organization, Settings.
     On a phone "always visible" means the TOP of the menu: at the end they
     sat below the route menu and every admin section (phone run PB-08 #2,
     2026-10-01). The person row is the phone's only door to the account menu
     (guard: MobileNavigationDrawer.account-row.test.ts). */
  const renderAccountRail = () => (
    <div className="shell-mobile-main-nav" data-shell-mobile-account-rail="">
      <MobileDrawerUserRow />
      {isAuthenticated ? <ShellOrgSwitcher variant="drawer" /> : null}
      <ShellSettingsMenu variant="drawer" />
      <div className="shell-mobile-section-divider" />
    </div>
  );

  /**
   * One menu view — a top-level group or a sub-area (the third level). A row
   * that carries its own children drills in one level deeper.
   */
  const renderMenu = (
    group: DrillNode & {
      children?: ShellNavChild[];
      ownedRoutePrefixes?: readonly string[];
    },
    level: "group" | "sub",
  ) => {
    const { sections, panels, actions } = partitionNavChildren(group.children ?? []);
    const activeChild =
      level === "group"
        ? findActiveNavBranch(pathname, group)
        : findActiveNavChild(pathname, group);
    const overviewActive =
      isOnRoute(pathname, group.href, true) ||
      (group.ownedRoutePrefixes ?? []).some((prefix) =>
        isOnRoute(pathname, prefix, true),
      );
    return (
      <div className="shell-mobile-main-nav" key={`${level}:${group.href}`}>
        <MobileSheetNavLink
          href={group.href}
          iconName={group.iconName}
          label={`Open ${group.label}`}
          external={group.external}
          openInNewTab={group.openInNewTab}
          exact
          active={overviewActive}
        />

        {sections.map((section) => (
          <section key={section.label ?? section.items[0]?.href}>
            {section.label ? (
              <div className="shell-mobile-section-label">{section.label}</div>
            ) : null}
            {section.items.map((child) =>
              level === "group" && child.children?.length ? (
                <GroupButton
                  key={navChildIdentity(child)}
                  item={child}
                  isActive={child === activeChild}
                  onOpen={() => setActiveSubId(navChildIdentity(child))}
                />
              ) : (
                renderChild(child, child === activeChild)
              ),
            )}
          </section>
        ))}

        {panels.length ? (
          <section>
            <div className="shell-mobile-section-label">Windows</div>
            {panels.map((child) => renderChild(child))}
          </section>
        ) : null}

        {actions.length ? (
          <section>
            <div className="shell-mobile-section-label">Create</div>
            {actions.map((child) => renderChild(child))}
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
              exact={"exact" in item ? item.exact : undefined}
            />
          ),
        )
      ) : (
        <div className="px-4 py-12 text-center type-body text-muted-foreground">
          No destinations match “{query.trim()}”.
        </div>
      )}
    </div>
  );

  // The settings Large Route supplies its own control search in the routed
  // menu. Ignore any global-menu query while that route is active so its
  // hidden main-nav search view cannot take over the sheet.
  const activeQuery = settingsRoute ? "" : query;
  const title = activeQuery.trim()
    ? "Search"
    : (activeSub?.label ?? activeGroup?.label ?? "Menu");
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
          onClick={() => {
            // One level at a time: sub-area → its group → the main menu.
            if (activeSub) setActiveSubId(null);
            else setActiveGroupId(null);
          }}
          aria-label={
            activeSub ? `Back to ${activeGroup?.label ?? "menu"}` : "Back to main menu"
          }
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
          {!activeGroup && !activeQuery.trim() ? renderAccountRail() : null}
          <MobileRouteMenuSlot showFullMenu={Boolean(activeQuery.trim())} />
          <div
            className="shell-mobile-view"
            key={
              activeQuery.trim()
                ? "search"
                : `${activeGroupId ?? "root"}/${activeSub ? activeSubId : ""}`
            }
          >
            {activeQuery.trim()
              ? renderSearch()
              : activeGroup && activeSub
                ? renderMenu(activeSub, "sub")
                : activeGroup
                  ? renderMenu(activeGroup, "group")
                  : renderRoot()}
          </div>
          <div className="shell-mobile-route-nav" />
        </nav>
      </BottomSheetBody>
    </BottomSheet>
  );
}
