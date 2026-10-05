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
  Monitor,
  Moon,
  MonitorSpeaker,
  Settings,
  SlidersHorizontal,
  Sun,
  SunMoon,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import AppLink from "@/components/navigation/AppLink";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { openOverlay } from "@/lib/redux/slices/overlaySlice";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { selectThemeMode, setMode, type ThemeMode } from "@/styles/themes/themeSlice";
import { SETTINGS_BASE } from "@/features/settings/route-shell/routing";
import { closeShellMobileMenu } from "@/features/shell/utils/closeShellMobileMenu";
import {
  MENU_ITEM_CLASS,
  USER_MENU_PANEL_CLASS,
} from "@/features/shell/components/header/header-right-menu/menuItemClass";
import { RailMenuHeader, RAIL_MENU_DIVIDER } from "./RailMenuHeader";

// The account rail's one menu look: the account menu's own row class.
const ROW = MENU_ITEM_CLASS;

const THEME_CHOICES: ReadonlyArray<{ mode: ThemeMode; label: string; Icon: LucideIcon }> = [
  { mode: "light", label: "Light", Icon: Sun },
  { mode: "dark", label: "Dark", Icon: Moon },
  { mode: "system", label: "Device", Icon: Monitor },
];

/**
 * Theme: Light | Dark | Device (the Vercel account-menu pattern). "Device" is
 * the default — the app follows the phone or computer until the person picks.
 */
function ThemeRow() {
  const dispatch = useAppDispatch();
  const mode = useAppSelector(selectThemeMode);
  return (
    <div className={cn(ROW, "cursor-default hover:bg-transparent")}>
      <SunMoon />
      <span className="min-w-0 flex-1 truncate">Theme</span>
      <div role="radiogroup" aria-label="Theme" className="flex items-center gap-0.5 rounded-full border border-border bg-muted p-0.5">
        {THEME_CHOICES.map(({ mode: choice, label, Icon }) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={mode === choice}
            aria-label={label}
            title={label}
            onClick={() => dispatch(setMode(choice))}
            className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-sm max-lg:h-11 max-lg:w-11"
          >
            <Icon aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** The list itself — one copy for the rail popover and the phone sheet. */
function SettingsMenuList({ onDone }: { onDone: () => void }) {
  const dispatch = useAppDispatch();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
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
        <span className="min-w-0 flex-1 truncate text-left">Preferences</span>
      </button>
      <ThemeRow />
      <button type="button" className={ROW} role="menuitem" onClick={() => open("audioControlWindow")}>
        <MonitorSpeaker />
        <span className="min-w-0 flex-1 truncate text-left">Media</span>
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

  // ssr-viewport-ok: both branches paint the SAME trigger; only the surface a tap opens differs (sheet vs popover).
  if (isMobile) {
    return (
      <>
        <span
          className="contents"
          onClick={(event) => {
            // The row sits in the navigation sheet, which this nested sheet
            // aria-hides; a row that keeps focus there trips "Blocked
            // aria-hidden… descendant retained focus" (phone run PB-08 #2).
            (event.target as HTMLElement).closest("button")?.blur();
            setOpen(true);
          }}
        >
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
