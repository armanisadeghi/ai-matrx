// app/(ssr)/ssr/chat/layout.tsx
//
// Server component — no async, no auth, no DB. Renders instantly.
//
// Architecture:
//   Uses the shell's core panel sidebar system (shell-panel).
//   Desktop: CSS grid driven by #shell-panel-toggle checkbox — zero JS layout.
//   Mobile:  CSS drawer driven by #shell-panel-mobile checkbox.
//
//   Server/client boundary:
//     - Everything in this file is server HTML — renders on first paint with
//       zero JS hydration cost.
//     - ChatPanelContent: client island that owns searchQuery state + renders
//       the SidebarSearchGroup pill + agent/chat lists.
//     - ChatDesktopHeader: client island for the desktop header strip —
//       just the PanelLeft toggle button.
//     - {children}: the page content — welcome screen or conversation view.
//   Agent selector lives in ChatHeaderControls (injected via PageHeaderPortal).
//
//   All shared state flows through Redux (activeChatSlice) — no context providers.

import {
  ChatPanelContent,
  ChatDesktopHeader,
} from "@/features/cx-chat/components/ChatSidebarClient";
import ChatMobileHeaderBar from "@/features/cx-chat/components/ChatMobileHeaderBar";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/chat", {
  titlePrefix: "SSR",
  title: "Chat",
  description: "SSR-first chat shell with panel sidebar and mobile chrome",
  letter: "Cs",
});

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Hide mobile dock — chat owns the bottom chrome */}
      <span className="shell-hide-dock" aria-hidden="true" />

      {/* ── Panel sidebar ──────────────────────────────────────────────────
          Detected by shell CSS via :has(.shell-panel).
          The <aside> and all structural divs are pure server HTML.
          Only the interactive children are client islands. */}
      <aside className="shell-panel">
        <ChatPanelContent />
      </aside>

      {/* Backdrop for mobile panel drawer */}
      <label
        htmlFor="shell-panel-mobile"
        className="shell-panel-backdrop"
        aria-label="Close chat menu"
      />

      {/* Desktop header strip — server HTML shell, client island inside */}
      <div className="shell-panel-header-strip">
        <ChatDesktopHeader />
      </div>

      {/* Mobile header bar — hamburger + new chat + agent name */}
      <ChatMobileHeaderBar />

      {/* Main workspace — pages render their own content here */}
      <div className="shell-panel-content">{children}</div>
    </>
  );
}
