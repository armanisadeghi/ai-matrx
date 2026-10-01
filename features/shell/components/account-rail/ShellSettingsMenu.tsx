"use client";

/**
 * ShellSettingsMenu — the Settings slot of the account rail (owner,
 * 2026-09-30): Settings, the organization and the person are the rail's three
 * bottom slots, always visible.
 *
 * It holds everything about how the app behaves for this person — the
 * Settings page, the Preferences window, light/dark, Media (audio) and Trash.
 * Theme, Media and Preferences used to sit inside the avatar menu; that menu
 * is now identity, quick access, admin and sign out.
 *
 * Desktop: a popover beside the rail. Phone: the same list in a bottom sheet
 * from the navigation drawer's Settings row (`variant="drawer"`).
 */

import { useState, type ReactNode } from "react";
import {
  ChevronRight,
  Moon,
  MonitorSpeaker,
  Settings,
  SlidersHorizontal,
  Sun,
  Trash2,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import AppLink from "@/components/navigation/AppLink";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { setMode } from "@/styles/themes/themeSlice";
import { useThemeMode } from "@/styles/themes/useThemeMode";
import { SETTINGS_BASE } from "@/features/settings/route-shell/routing";
import { closeShellMobileMenu } from "@/features/shell/utils/closeShellMobileMenu";
import {
  MENU_ITEM_CLASS,
  USER_MENU_PANEL_CLASS,
} from "@/features/shell/components/header/header-right-menu/menuItemClass";
import { RailMenuHeader, RAIL_MENU_DIVIDER } from "./RailMenuHeader";

// The account rail's one menu look: the account menu's own row class.
const ROW = MENU_ITEM_CLASS;

/** The list itself — one copy for the rail popover and the phone sheet. */
function SettingsMenuList({ onDone }: { onDone: () => void }) {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const isDark = useThemeMode() === "dark";
  const open = (overlayId: "userPreferences" | "audioControlWindow") => {
    onDone();
    dispatch(openOverlay({ overlayId }));
  };

  return (
    <div className="flex flex-col" role="menu" aria-label="Settings">
      {/* The same header row the Organization and account menus open with; it
          opens the Settings page. */}
      <RailMenuHeader
        mark={
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-600 text-white dark:bg-slate-500">
            <Settings className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          </span>
        }
        title="Settings"
        subtitle="All settings"
        href={SETTINGS_BASE}
        onNavigate={onDone}
      />
      {RAIL_MENU_DIVIDER}
      <button type="button" className={ROW} role="menuitem" onClick={() => open("userPreferences")}>
        <SlidersHorizontal />
        <span className="min-w-0 flex-1 truncate">Preferences</span>
      </button>
      <button
        type="button"
        className={ROW}
        role="menuitem"
        onClick={() => dispatch(setMode(isDark ? "light" : "dark"))}
      >
        {isDark ? <Sun /> : <Moon />}
        <span className="min-w-0 flex-1 truncate">{isDark ? "Light mode" : "Dark mode"}</span>
      </button>
      <button type="button" className={ROW} role="menuitem" onClick={() => open("audioControlWindow")}>
        <MonitorSpeaker />
        <span className="min-w-0 flex-1 truncate">Media</span>
      </button>
      {isAuthenticated ? (
        <AppLink href="/trash" onClick={onDone} className={ROW} role="menuitem">
          <Trash2 />
          <span className="min-w-0 flex-1 truncate">Trash</span>
        </AppLink>
      ) : null}
    </div>
  );
}

export function ShellSettingsMenu({ variant = "rail" }: { variant?: "rail" | "drawer" }) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const done = () => {
    setOpen(false);
    if (variant === "drawer") closeShellMobileMenu();
  };

  const trigger: ReactNode =
    variant === "rail" ? (
      <button
        type="button"
        title="Settings"
        aria-label="Settings"
        data-shell-settings-menu="rail"
        className="shell-nav-item shell-nav-stable shell-tactile-subtle"
      >
        <span className="shell-nav-icon">
          <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="shell-nav-label">Settings</span>
      </button>
    ) : (
      <button
        type="button"
        aria-label="Settings"
        data-shell-settings-menu="drawer"
        className="shell-mobile-nav-item w-full"
      >
        <span className="shell-nav-icon">
          <Settings size={20} strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1 truncate text-left">Settings</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </button>
    );

  if (isMobile) {
    return (
      <>
        <span className="contents" onClick={() => setOpen(true)}>
          {trigger}
        </span>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent className="bg-textured pb-safe">
            <DrawerHeader className="sr-only">
              <DrawerTitle>Settings</DrawerTitle>
            </DrawerHeader>
            <div className="matrx-touch-targets px-2 pb-4">
              <SettingsMenuList onDone={done} />
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent side={variant === "rail" ? "right" : "top"} align="end" sideOffset={8} className={USER_MENU_PANEL_CLASS}>
        <SettingsMenuList onDone={done} />
      </PopoverContent>
    </Popover>
  );
}
