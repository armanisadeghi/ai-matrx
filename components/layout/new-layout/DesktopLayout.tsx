"use client";
//
// DesktopLayout sits in the static dep graph of every authenticated route.
// Rules for this file:
//   1. Type-only imports use `import type`.
//   2. No nested `TooltipProvider` — the global provider is mounted in
//      `app/Providers.tsx` (delayDuration=200). Rendering a second provider
//      here just remounts every Tooltip on sidebar toggles.
//   3. No `lazy()` for individual lucide icons — the package is already
//      loaded eagerly for the always-rendered icons; lazy-wrapping a single
//      icon adds Suspense overhead without bundle savings.
//
// NOTE on `next/dynamic`: do NOT lazy-load the header children from here.
// This component only mounts when ResponsiveLayout flips `isMobile` from
// `true` → `false`, which is a synchronous state update on the client. If
// multiple children suspend during that single render, React 19 collapses
// the parent tree to nothing until the chunks resolve. The right way to
// shrink this file's footprint is to convert it into a server-rendered
// shell with each interactive piece pulled out as its own client island —
// not to wrap children in `dynamic()` from inside this client component.
//
import React, { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Mic, Bug, Shield } from "lucide-react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectIsOverlayOpen,
  toggleOverlay,
} from "@/lib/redux/slices/overlaySlice";
import {
  selectIsSuperAdmin,
  selectUser,
} from "@/lib/redux/selectors/userSelectors";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MenuTapButton } from "@/components/icons/tap-buttons";
import { useVoicePadAdvanced } from "@/components/official-candidate/voice-pad/hooks/useVoicePad";
import ShellUserMenu from "@/features/shell/components/header/header-right-menu/ShellUserMenu";
import NotificationDropdown from "@/components/ui/notifications/NotificationDropdown";
import { MessageIcon } from "@/features/messaging/components/MessageIcon";
import { QuickActionsMenu } from "@/features/quick-actions/components/QuickActionsMenu";
import FeedbackButton from "@/features/feedback/FeedbackButton";

import type { Notification } from "@/types/notification.types";

interface SidebarLink {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface DesktopLayoutProps {
  children: React.ReactNode;
  primaryLinks: SidebarLink[];
  secondaryLinks?: SidebarLink[];
  initialOpen?: boolean;
  uniqueId?: string;
  isAdmin?: boolean;
}

export default function DesktopLayout({
  children,
  primaryLinks,
  secondaryLinks = [],
  initialOpen = false,
  uniqueId = "desktop-layout",
  isAdmin = false,
}: DesktopLayoutProps) {
  const pathname = usePathname();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(!initialOpen);
  const [isAdminMenuCollapsed, setIsAdminMenuCollapsed] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const dispatch = useAppDispatch();
  const isAdminIndicatorVisible = useAppSelector((state) =>
    selectIsOverlayOpen(state, "adminIndicator"),
  );
  const voicePad = useVoicePadAdvanced();

  // Get user data from Redux
  const user = useAppSelector(selectUser);
  const isAdminUser = useAppSelector(selectIsSuperAdmin) ?? false;
  const displayName =
    user.userMetadata?.name ||
    user.userMetadata?.fullName ||
    user.email?.split("@")[0] ||
    "User";
  const profilePhoto = user.userMetadata?.picture || null;

  // Force hide tooltips immediately when sidebar state changes
  useEffect(() => {
    // Set transitioning state immediately on collapse state change
    setIsTransitioning(true);
    const timer = setTimeout(() => {
      setIsTransitioning(false);
    }, 350);

    return () => clearTimeout(timer);
  }, [isSidebarCollapsed]);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(!isSidebarCollapsed);
  };
  const toggleAdminMenu = () => setIsAdminMenuCollapsed(!isAdminMenuCollapsed);

  // Only show secondary links if admin indicator is visible
  const shouldShowSecondaryLinks = isAdmin && isAdminIndicatorVisible;

  // Helper function to check if a link is active based on the current pathname
  const isLinkActive = (linkHref: string) => {
    // Remove trailing slash from both pathname and linkHref for consistent comparison
    const normalizedPathname =
      pathname.endsWith("/") && pathname.length > 1
        ? pathname.slice(0, -1)
        : pathname;
    const normalizedHref =
      linkHref.endsWith("/") && linkHref.length > 1
        ? linkHref.slice(0, -1)
        : linkHref;

    // Check if the current pathname starts with the link href
    return (
      normalizedPathname === normalizedHref ||
      normalizedPathname.startsWith(normalizedHref + "/")
    );
  };

  return (
    <div id={uniqueId} className="min-h-dvh text-gray-800 dark:text-gray-100">
      {/* Main Header — matrx-glass-thin-border bar, content blurs through */}
      <header className="fixed top-0 left-0 right-0 z-50 h-10 overflow-visible matrx-glass-thin-border">
        <div className="flex items-center justify-between h-full pl-1 pr-2 overflow-visible">
          {/* Left side - Menu toggle and page-specific content */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <MenuTapButton
              onClick={toggleSidebar}
              ariaLabel={
                isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
              }
              tooltipSide="right"
            />

            {/* Page-specific controls will be inserted here */}
            <div id="page-specific-header-content" className="flex-1 min-w-0" />
          </div>
          {/* Right side - Actions. No `gap-*` here — every child is a 44×44
              tap target with its own invisible spacing built in. */}
          <div className="flex items-center overflow-visible">
            <QuickActionsMenu />
            <FeedbackButton />
            <MessageIcon />
            <NotificationDropdown
              notifications={notifications}
              onMarkAsRead={(id) => {
                setNotifications((prev) =>
                  prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
                );
              }}
              onMarkAllAsRead={() => {
                setNotifications((prev) =>
                  prev.map((n) => ({ ...n, isRead: true })),
                );
              }}
              onClearAll={() => {
                setNotifications([]);
              }}
              onNotificationClick={(notification) => {
                if (notification.link) {
                  window.location.href = notification.link;
                }
              }}
            />
            <ShellUserMenu />
          </div>
        </div>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-10 bottom-0 ${isSidebarCollapsed ? "w-11" : "w-56"} bg-background transition-all duration-300 z-40 overflow-hidden`}
      >
        <nav className="px-1 h-full flex flex-col">
          {/* Primary Links */}
          {primaryLinks.length > 0 && (
            <div className="mb-2 flex-shrink-0">
              <ul className="space-y-1">
                {primaryLinks.map((link, index) => (
                  <li key={`primary-${index}`}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={link.href}
                          className={`relative flex items-center px-2 py-2 rounded-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] ${
                            isLinkActive(link.href)
                              ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-sm"
                              : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 hover:shadow-sm"
                          }`}
                        >
                          <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center [&>svg]:!text-current">
                            {link.icon}
                          </div>
                          <span
                            className={`absolute left-9 text-xs whitespace-nowrap transition-all duration-300 ease-in-out ${
                              isSidebarCollapsed
                                ? "opacity-0 pointer-events-none"
                                : "opacity-100"
                            }`}
                          >
                            {link.label}
                          </span>
                        </a>
                      </TooltipTrigger>
                      {isSidebarCollapsed && !isTransitioning && (
                        <TooltipContent
                          side="right"
                          className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
                        >
                          {link.label}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Route-specific content area - Scrollable middle section */}
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-none mb-2">
            <div id="page-specific-sidebar-content" className="h-full" />
          </div>

          {/* Secondary Links (Admin) - Only show if admin indicator is visible */}
          {shouldShowSecondaryLinks && secondaryLinks.length > 0 && (
            <div className="flex-shrink-0 border-t border-gray-300 dark:border-gray-700 pt-2 mb-2 flex flex-col min-h-0">
              <h3
                onClick={(e) => {
                  e.stopPropagation();
                  toggleAdminMenu();
                }}
                className={`px-1 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider transition-all duration-300 ease-in-out cursor-pointer hover:text-gray-700 dark:hover:text-gray-300 flex-shrink-0 ${
                  isSidebarCollapsed
                    ? "opacity-0 pointer-events-none"
                    : "opacity-100"
                }`}
              >
                Admin{" "}
                {!isSidebarCollapsed && (isAdminMenuCollapsed ? "▸" : "▾")}
              </h3>
              {!isAdminMenuCollapsed && (
                <div className="overflow-y-auto scrollbar-none max-h-[300px]">
                  <ul className="space-y-1">
                    {secondaryLinks.map((link, index) => (
                      <li key={`secondary-${index}`}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={link.href}
                              className={`relative flex items-center px-2 py-2 rounded-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] ${
                                isLinkActive(link.href)
                                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 shadow-sm"
                                  : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 hover:shadow-sm"
                              }`}
                            >
                              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                                {link.icon}
                              </div>
                              <span
                                className={`absolute left-9 text-xs whitespace-nowrap transition-all duration-300 ease-in-out ${
                                  isSidebarCollapsed
                                    ? "opacity-0 pointer-events-none"
                                    : "opacity-100"
                                }`}
                              >
                                {link.label}
                              </span>
                            </a>
                          </TooltipTrigger>
                          {isSidebarCollapsed && !isTransitioning && (
                            <TooltipContent
                              side="right"
                              className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
                            >
                              {link.label}
                            </TooltipContent>
                          )}
                        </Tooltip>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Admin indicator toggle — same overlay & selector as UserMenuPanel */}
          {isAdminUser && (
            <div className="flex-shrink-0 mb-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() =>
                      dispatch(toggleOverlay({ overlayId: "adminIndicator" }))
                    }
                    className={`relative flex items-center px-2 py-2 rounded-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] w-full ${
                      isAdminIndicatorVisible
                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 shadow-sm"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                      <Bug
                        className={`w-4 h-4 ${
                          isAdminIndicatorVisible
                            ? "text-green-600 dark:text-green-400"
                            : ""
                        }`}
                      />
                    </div>
                    <span
                      className={`absolute left-9 text-xs whitespace-nowrap transition-all duration-300 ease-in-out ${
                        isSidebarCollapsed
                          ? "opacity-0 pointer-events-none"
                          : "opacity-100"
                      }`}
                    >
                      {isAdminIndicatorVisible ? "Hide" : "Show"} Indicator
                    </span>
                  </button>
                </TooltipTrigger>
                {isSidebarCollapsed && !isTransitioning && (
                  <TooltipContent
                    side="right"
                    className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
                  >
                    {isAdminIndicatorVisible ? "Hide" : "Show"} Admin Indicator
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          )}

          {/* Voice Pad Toggle */}
          <div className="flex-shrink-0 mb-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={voicePad.toggle}
                  className={`relative flex items-center px-2 py-2 rounded-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] w-full ${
                    voicePad.isOpen
                      ? "bg-primary/10 dark:bg-primary/20 text-primary shadow-sm"
                      : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-primary hover:shadow-sm"
                  }`}
                >
                  <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                    <Mic className="w-4 h-4" />
                  </div>
                  <span
                    className={`absolute left-9 text-xs whitespace-nowrap transition-all duration-300 ease-in-out ${
                      isSidebarCollapsed
                        ? "opacity-0 pointer-events-none"
                        : "opacity-100"
                    }`}
                  >
                    Voice
                  </span>
                </button>
              </TooltipTrigger>
              {isSidebarCollapsed && !isTransitioning && (
                <TooltipContent
                  side="right"
                  className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
                >
                  Voice Input
                </TooltipContent>
              )}
            </Tooltip>
          </div>

          {/* Admin Dashboard Quick Link - Lazy loaded, only for admins */}
          {isAdmin && (
            <div className="flex-shrink-0 mb-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href="/administration"
                    className={`relative flex items-center px-2 py-2 rounded-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] ${
                      isLinkActive("/administration")
                        ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 shadow-sm"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex-shrink-0 w-4 h-4 flex items-center justify-center">
                      <Shield className="w-4 h-4" />
                    </div>
                    <span
                      className={`absolute left-9 text-xs whitespace-nowrap transition-all duration-300 ease-in-out ${
                        isSidebarCollapsed
                          ? "opacity-0 pointer-events-none"
                          : "opacity-100"
                      }`}
                    >
                      Admin
                    </span>
                  </Link>
                </TooltipTrigger>
                {isSidebarCollapsed && !isTransitioning && (
                  <TooltipContent
                    side="right"
                    className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
                  >
                    Admin Dashboard
                  </TooltipContent>
                )}
              </Tooltip>
            </div>
          )}

          {/* User Profile Section - Fixed at bottom */}
          <div className="flex-shrink-0 border-t border-gray-300 dark:border-gray-700 pt-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/settings/preferences"
                  className="relative flex items-center px-2 py-2 rounded-lg transition-all duration-200 ease-in-out transform hover:scale-[1.02] active:scale-[0.98] hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 hover:shadow-sm"
                >
                  {profilePhoto ? (
                    <div className="relative flex-shrink-0 w-6 h-6 rounded-full overflow-hidden">
                      <Image
                        src={profilePhoto}
                        alt={displayName}
                        fill
                        className="object-cover"
                        sizes="24px"
                      />
                    </div>
                  ) : (
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-medium">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span
                    className={`absolute left-9 text-xs whitespace-nowrap transition-all duration-300 ease-in-out ${
                      isSidebarCollapsed
                        ? "opacity-0 pointer-events-none"
                        : "opacity-100"
                    }`}
                  >
                    {displayName}
                  </span>
                </Link>
              </TooltipTrigger>
              {isSidebarCollapsed && !isTransitioning && (
                <TooltipContent
                  side="right"
                  className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
                >
                  {displayName}
                </TooltipContent>
              )}
            </Tooltip>
          </div>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main
        className={`pt-10 ${isSidebarCollapsed ? "pl-11" : "pl-56"} transition-all duration-300`}
      >
        {children}
      </main>
    </div>
  );
}
