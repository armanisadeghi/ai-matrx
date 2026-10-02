// AppShell — the canonical modern application shell (sidebar + header + islands).
//
// Single source of truth for the chrome that wraps authenticated routes. Used by
// BOTH `app/(core)/layout.tsx` and `app/(admin)/layout.tsx` so the core app and
// the admin tree share one shell — no second "admin layout" to drift.
//
// The caller (each route-group layout) owns auth, the super-admin gate, and
// building `initialReduxState` / `userData`; it then hands the resolved values
// here. This component owns only the shell structure.
//
// Server Component: `Providers` is the single client boundary; Sidebar/Header
// are server-rendered and stream through it.

import "@/styles/shell.css";
import "@/features/shell/components/header/variants/header-variants.css";
import { Providers } from "@/app/Providers";
import Sidebar from "@/features/shell/components/sidebar/Sidebar";
import Header from "@/features/shell/components/header/Header";
import ShellUserBlock from "@/features/shell/components/user-block/ShellUserBlock";
import MobileDock from "@/features/shell/components/dock/MobileDock";
import MobileSideSheet from "@/features/shell/components/mobile-sheet/MobileSideSheet";
import GlassPortal from "@/features/shell/components/GlassPortal";
import NavActiveSync from "@/features/shell/components/NavActiveSync";
import MobileMenuPathSync from "@/features/shell/components/MobileMenuPathSync";
import VisualViewportSync from "@/features/shell/components/VisualViewportSync";
import ShellSidebarCookieSync from "@/features/shell/components/ShellSidebarCookieSync";
import { ShellChromeRouteSync } from "@/features/shell/components/ShellChromeMode";
import { shellChromeAttributes } from "@/features/shell/constants/canvas-chrome-routes";
import DeferredIslands from "@/features/shell/islands/DeferredIslands";
import { cookies } from "next/headers";
import { ShellChatDock } from "@ai-matrx/chat/canvas/workspace/ShellChatDock";
import { shellChatFamily, shellChatHostedElsewhere, shellChatWorkspaceId } from "@ai-matrx/chat/canvas/workspace/shell-chat-route";
import { SHELL_DOMAIN_PANEL_COOKIE, shellToggleChecked } from "@/features/shell/constants/sidebar-cookie";
import { CANVAS_CHAT_SIZES, CANVAS_PANEL_IDS, canvasChatCookieName } from "@ai-matrx/chat/canvas/workspace/workspace-cookies";
import { readSidePanelWidth } from "@/components/official/side-panel/side-panel-width.server";
import { readComposerModeCookie } from "@ai-matrx/chat/next/server/composer-mode.server";
import { ShellCanvasColumn } from "@/features/canvas/host/ShellCanvasColumn";
import type { UserData } from "@/utils/userDataMapper";
import type { BaseReduxState } from "@/types/reduxTypes";
// CJS flag — also read by next.config.js to alias Sidebar/etc. to stubs.
import { FORCE_EXCLUDE_SIDEMENU } from "@/features/shell/build-flags.js";
import { SettingsRouteProvider } from "@/features/settings/route-shell/SettingsRouteProvider";
import { isUserSettingsPath } from "@/features/settings/route-shell/settings-route-path";
import { isDomainPanelPath } from "@/features/shell/constants/route-menu-registry";

interface AppShellProps {
  children: React.ReactNode;
  /** Preloaded Redux bootstrap state (user + optional SSR caches). */
  initialReduxState: BaseReduxState;
  /** Resolved user (real user or mapped guest). Drives the header user menu. */
  userData: UserData;
  isAuthenticated: boolean;
  /** SSR pathname (`x-pathname` header) — stamped on `.shell-root` for the
   *  CSS-driven active-nav system. */
  pathname: string;
  /** Sidebar expanded/collapsed, read from the persisted cookie at SSR. */
  sidebarExpanded: boolean;
}

export default async function AppShell({
  children,
  initialReduxState,
  userData,
  isAuthenticated,
  pathname,
  sidebarExpanded,
}: AppShellProps) {
  const settingsRoute = isUserSettingsPath(pathname);
  // The chat dock's first paint is the person's own remembered choice for this
  // page family (null = not chosen yet → the dock applies the wide-screen default).
  const cookieStore = await cookies();
  const chatCookie = isAuthenticated
    ? cookieStore.get(canvasChatCookieName(shellChatWorkspaceId(shellChatFamily(pathname))))?.value
    : undefined;
  const chatInitialOpen = chatCookie === undefined ? null : !chatCookie.endsWith(":closed");
  const [chatWidth, composerMode] = isAuthenticated
    ? await Promise.all([readSidePanelWidth(CANVAS_PANEL_IDS.chat, CANVAS_CHAT_SIZES), readComposerModeCookie()])
    : [undefined, null];
  // A remembered open chat reserves its width in the first paint, before the
  // dock hydrates and publishes it — the page never paints under the dock.
  const chatReserved =
    chatInitialOpen === true && chatWidth !== undefined && !shellChatHostedElsewhere(pathname, isAuthenticated);
  const domainPanel = isDomainPanelPath(pathname);
  const toggleChecked = shellToggleChecked(
    domainPanel,
    sidebarExpanded,
    cookieStore.get(SHELL_DOMAIN_PANEL_COOKIE)?.value,
  );
  return (
    <Providers initialReduxState={initialReduxState}>
      <SettingsRouteProvider>
        <div
          className="shell-root"
          data-pathname={pathname}
          {...shellChromeAttributes(pathname, isAuthenticated)}
          {...(settingsRoute ? { "data-settings-route": "" } : {})}
          {...(domainPanel ? { "data-domain-panel": "" } : {})}
          style={chatReserved ? ({ "--shell-chat-w": `${chatWidth}px` } as React.CSSProperties) : undefined}
          {...(FORCE_EXCLUDE_SIDEMENU ? { "data-no-sidebar": "" } : {})}
        >
          <input
            type="checkbox"
            id="shell-sidebar-toggle"
            aria-hidden="true"
            defaultChecked={toggleChecked}
          />
          <input type="checkbox" id="shell-mobile-menu" aria-hidden="true" />
          <input type="checkbox" id="shell-user-menu" aria-hidden="true" />
          <input type="checkbox" id="shell-panel-toggle" aria-hidden="true" />
          <input type="checkbox" id="shell-panel-mobile" aria-hidden="true" />

          {/* When FORCE_EXCLUDE_SIDEMENU, next.config aliases these imports to stubs. */}
          <Sidebar pathname={pathname} isAuthenticated={isAuthenticated} />
          <Header isAuthenticated={isAuthenticated} />
          <ShellUserBlock userData={userData} isAuthenticated={isAuthenticated} />

          <main className="shell-main">{children}</main>

          {/* A direct child of .shell-root: it publishes --shell-chat-w here. */}
          <ShellChatDock
            initialOpen={chatInitialOpen}
            initialWidth={chatWidth}
            initialMode={composerMode}
            signedIn={isAuthenticated}
            initialPathname={pathname}
          />

          <MobileSideSheet
            isAuthenticated={isAuthenticated}
            pathname={pathname}
          />
        </div>
      </SettingsRouteProvider>

      {/* THE canvas: its own full-height column on the right edge; the shell
          root shrinks by --shell-canvas-w so header and page end at its edge. */}
      <ShellCanvasColumn />

      <GlassPortal>
        <MobileDock isAuthenticated={isAuthenticated} />
      </GlassPortal>

      <NavActiveSync />
      <MobileMenuPathSync />
      <VisualViewportSync />
      <ShellSidebarCookieSync />
      <ShellChromeRouteSync />
      {/* Active-organization hydration is owned by the sync engine
          (`appContextPolicy`, registered in lib/sync/registry) — it rehydrates
          the org from cache before first paint and reconciles via remote.fetch.
          The old <ActiveOrgBootstrap /> island was retired in favor of it. */}
      <DeferredIslands />
    </Providers>
  );
}
