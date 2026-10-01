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

const ROW =
  "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-muted-foreground";

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
    <div className="flex flex-col gap-0.5 p-1" role="menu" aria-label="Settings">
      <AppLink href={SETTINGS_BASE} onClick={onDone} className={ROW} role="menuitem">
        <Settings />
        <span className="min-w-0 flex-1 truncate">All settings</span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
      </AppLink>
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
      <PopoverContent side={variant === "rail" ? "right" : "top"} align="end" sideOffset={8} sizing="content" className="w-56 p-0">
        <SettingsMenuList onDone={done} />
      </PopoverContent>
    </Popover>
  );
}
