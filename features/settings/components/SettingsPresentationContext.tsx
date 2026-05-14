"use client";

/**
 * SettingsPresentationContext
 *
 * Lets any component inside the settings surface know *how* it's being
 * rendered — as a standalone route (`/settings/profile`,
 * `/settings/organizations`, …), as the desktop window panel
 * (`userPreferencesWindow`), or as the mobile push-nav drawer.
 *
 * The bug this solves: components like `<SettingsLink>`,
 * `<OrganizationCard>`, and `<UserContentTemplateManager>` call
 * `router.push("/somewhere")` unconditionally. That's correct on a
 * route, but inside the settings window it navigates the *whole page*
 * away — silently dismissing the window and yanking the user out of
 * settings. The right behavior in window/drawer mode is: dismiss the
 * shell first, *then* navigate, so the user lands at the destination
 * cleanly instead of "the window blinks out and a new page appears
 * underneath."
 *
 * Usage:
 *
 *   const { presentation, navigate, switchSettingsTab } =
 *     useSettingsPresentation();
 *
 *   <button onClick={(e) => navigate("/organizations/abc/settings", e)}>
 *     Manage
 *   </button>
 *
 * `navigate` handles Cmd/Ctrl-click and middle-click for you (opens in
 * a new tab) and does the close-then-push dance when inside the shell.
 *
 * `switchSettingsTab(id, fallbackHref?)` flips the active tab when
 * inside the shell, and falls back to a real route navigation otherwise.
 */

import { createContext, useCallback, useContext, useMemo } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode, MouseEvent as ReactMouseEvent } from "react";

export type SettingsPresentation = "route" | "window" | "drawer";

export interface SettingsPresentationContextValue {
  /** How the settings UI is currently mounted. */
  presentation: SettingsPresentation;
  /** Dismiss the shell. Only defined in `window` / `drawer`. */
  closeShell?: () => void;
  /** Switch the active settings tab in-place. Only defined in `window` / `drawer`. */
  setActiveTabId?: (tabId: string) => void;
}

const DEFAULT_VALUE: SettingsPresentationContextValue = {
  presentation: "route",
};

const SettingsPresentationContext =
  createContext<SettingsPresentationContextValue>(DEFAULT_VALUE);

type ProviderProps = SettingsPresentationContextValue & {
  children: ReactNode;
};

/**
 * Provider — the shell (or a route page) wraps its tree with this so
 * descendants can pick the right navigation behavior.
 */
export function SettingsPresentationProvider({
  presentation,
  closeShell,
  setActiveTabId,
  children,
}: ProviderProps) {
  const value = useMemo<SettingsPresentationContextValue>(
    () => ({ presentation, closeShell, setActiveTabId }),
    [presentation, closeShell, setActiveTabId],
  );
  return (
    <SettingsPresentationContext.Provider value={value}>
      {children}
    </SettingsPresentationContext.Provider>
  );
}

/**
 * Returns the raw presentation context. Safe to call from anywhere —
 * falls back to `{ presentation: "route" }` when no provider is in the
 * tree (so route pages "just work" without needing to wrap themselves).
 */
export function useSettingsPresentation(): SettingsPresentationContextValue {
  return useContext(SettingsPresentationContext);
}

/** True iff a modifier on the click means "open in a new tab/window". */
function isNewTabIntent(event?: ReactMouseEvent | MouseEvent | null): boolean {
  if (!event) return false;
  // ⌘ on macOS, Ctrl elsewhere, Shift (new window), middle-click (button 1).
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    ("button" in event && event.button === 1)
  );
}

export interface SettingsNavigateOptions {
  /**
   * Force a presentation, ignoring the context. Mostly useful for tests.
   */
  force?: SettingsPresentation;
  /**
   * Open in a new tab regardless of modifiers. Equivalent to a
   * Cmd/Ctrl-click.
   */
  newTab?: boolean;
}

/**
 * Returns a function that navigates to an internal route in a
 * presentation-aware way:
 *
 *   - **route** → `router.push(href)` (or `window.open` for new-tab intent)
 *   - **window/drawer** → `closeShell()` first, then `router.push(href)`
 *     (new-tab intent always opens in a new tab, leaves the shell open)
 *
 * Pass the original click event as the optional second arg to honor
 * Cmd/Ctrl/Shift/middle-click "open in new tab" — when those are
 * detected, we *never* close the shell, so the user keeps their
 * settings context.
 *
 * External URLs (anything starting with `http://` or `https://`) bypass
 * the shell-close and just open in a new tab.
 */
export function useSettingsNavigate() {
  const router = useRouter();
  const { presentation, closeShell } = useSettingsPresentation();

  return useCallback(
    (
      href: string,
      event?: ReactMouseEvent | MouseEvent | null,
      options?: SettingsNavigateOptions,
    ) => {
      if (!href) return;

      const isExternal = /^https?:\/\//i.test(href);
      const newTab = options?.newTab ?? isNewTabIntent(event);
      const mode = options?.force ?? presentation;

      // External URLs: just open a new tab. Leave the shell open.
      if (isExternal) {
        if (event && "preventDefault" in event) event.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
        return;
      }

      // New-tab intent on an internal href: let the browser handle it.
      // If we were called from an <a> onClick, returning early keeps
      // the native modifier behavior. If we were called from a button
      // (no <a> involved), open a new tab manually.
      if (newTab) {
        const target = event?.target as HTMLElement | undefined;
        const fromAnchor =
          target?.closest("a[href]") instanceof HTMLAnchorElement;
        if (!fromAnchor) {
          if (event && "preventDefault" in event) event.preventDefault();
          window.open(href, "_blank", "noopener,noreferrer");
        }
        // If the event came from a real <a>, we *don't* preventDefault
        // so the browser executes its native cmd-click semantics.
        return;
      }

      // Plain left click: route to a real destination. Window/drawer
      // dismiss the shell first so the page change isn't jarring.
      if (event && "preventDefault" in event) event.preventDefault();

      if (mode === "window" || mode === "drawer") {
        closeShell?.();
      }

      router.push(href);
    },
    [presentation, closeShell, router],
  );
}

/**
 * Switch settings tabs in-place when inside the shell; fall back to a
 * real route navigation when on a standalone settings route.
 *
 * Pass `fallbackHref` for cases where the route-mode equivalent is a
 * separate page (e.g. `/settings/voice` for `voice.input`). When no
 * fallback is supplied we route to `/settings/preferences?tab={id}`,
 * which the legacy redirect page resolves into `openOverlay(...)`.
 */
export function useSettingsTabNavigate() {
  const router = useRouter();
  const { presentation, setActiveTabId } = useSettingsPresentation();

  return useCallback(
    (
      tabId: string,
      options?: {
        fallbackHref?: string;
        event?: ReactMouseEvent | MouseEvent | null;
      },
    ) => {
      const event = options?.event ?? null;

      // New-tab intent always navigates by URL, never re-uses the
      // in-place tab switch — the user expects a fresh tab.
      if (isNewTabIntent(event)) {
        const href =
          options?.fallbackHref ?? `/settings/preferences?tab=${tabId}`;
        const target = event?.target as HTMLElement | undefined;
        const fromAnchor =
          target?.closest("a[href]") instanceof HTMLAnchorElement;
        if (!fromAnchor) {
          if (event && "preventDefault" in event) event.preventDefault();
          window.open(href, "_blank", "noopener,noreferrer");
        }
        return;
      }

      if (event && "preventDefault" in event) event.preventDefault();

      if (presentation !== "route" && setActiveTabId) {
        setActiveTabId(tabId);
        return;
      }

      router.push(
        options?.fallbackHref ?? `/settings/preferences?tab=${tabId}`,
      );
    },
    [presentation, setActiveTabId, router],
  );
}
