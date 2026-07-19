"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, PanelLeftOpen, Layers } from "lucide-react";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { TranscriptsListHeader } from "@/features/transcripts/components/TranscriptsListHeader";
import {
  Group,
  Panel,
  Separator,
  type Layout,
  type PanelImperativeHandle,
} from "react-resizable-panels";
import { cn } from "@/lib/utils";
import {
  MobilePanelShell,
  type MobileShellPanel,
} from "@/features/shell/components/header/templates/MobilePanelShell";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveSession, selectFetchStatus } from "../redux/selectors";
import { ActiveSessionView } from "./ActiveSessionView";
import { EmptySessionState } from "./EmptySessionState";
import { StudioSidebar } from "./StudioSidebar";
import {
  STUDIO_SIDEBAR_COOKIE_NAME,
  STUDIO_SIDEBAR_DEFAULT_LAYOUT,
  STUDIO_SIDEBAR_GROUP_ID,
  STUDIO_SIDEBAR_PANEL_IDS,
} from "./resize/studioSidebarCookie";

interface StudioLayoutProps {
  className?: string;
  showSidebar?: boolean;
  defaultColumnLayout?: Record<string, number>;
  defaultSidebarLayout?: Layout;
  /** When set, session pick/create/delete updates the page URL (`?session=`). */
  navigateToSession?: (sessionId: string | null) => void;
}

export function StudioLayout({
  className,
  showSidebar = true,
  defaultColumnLayout,
  defaultSidebarLayout,
  navigateToSession,
}: StudioLayoutProps) {
  const activeSession = useAppSelector(selectActiveSession);
  const fetchStatus = useAppSelector(selectFetchStatus);
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  // Hydration gate — same reasoning as StudioSidebar. Server renders with
  // empty store (no active session) so the empty-state placeholder lands
  // in the SSR HTML; client gets seeds + initialSessionId via the hydrator
  // post-mount and would otherwise render `<ActiveSessionView>` instead.
  // We render the loading shell on both server and the first client paint
  // so hydration matches, then flip after.
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);

  const main = (
    <main className="flex h-full flex-1 min-w-0 flex-col">
      {!isHydrated ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : fetchStatus === "loading" && !activeSession ? (
        <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
          Loading sessions…
        </div>
      ) : activeSession ? (
        <ActiveSessionView
          session={activeSession}
          defaultColumnLayout={defaultColumnLayout}
          onSessionDeleted={
            navigateToSession ? () => navigateToSession(null) : undefined
          }
        />
      ) : (
        <EmptySessionState navigateToSession={navigateToSession} />
      )}
    </main>
  );

  const noSidebarLayout = <div className="flex flex-1 min-w-0">{main}</div>;

  const desktopLayout = showSidebar ? (
    <Group
      id={STUDIO_SIDEBAR_GROUP_ID}
      orientation="horizontal"
      defaultLayout={defaultSidebarLayout ?? STUDIO_SIDEBAR_DEFAULT_LAYOUT}
      onLayoutChanged={(layout) => {
        const value = encodeURIComponent(JSON.stringify(layout));
        document.cookie = `${STUDIO_SIDEBAR_COOKIE_NAME}=${value}; path=/; max-age=31536000; SameSite=Lax`;
      }}
      className="flex h-full w-full"
    >
      <Panel
        id={STUDIO_SIDEBAR_PANEL_IDS.sidebar}
        panelRef={sidebarPanelRef}
        collapsible
        collapsedSize="0%"
        minSize="12%"
        maxSize="40%"
        onResize={(next, _id, prev) => {
          if (prev === undefined) return;
          const wasCollapsed = prev.asPercentage === 0;
          const isCollapsedNow = next.asPercentage === 0;
          if (wasCollapsed !== isCollapsedNow) setCollapsed(isCollapsedNow);
        }}
        style={{ overflow: "hidden", height: "100%" }}
      >
        <StudioSidebar
          className="h-full"
          onCollapse={() => sidebarPanelRef.current?.collapse()}
          navigateToSession={navigateToSession}
        />
      </Panel>
      <Separator
        className={cn(
          "bg-border transition-colors focus:outline-none",
          "data-[separator=hover]:bg-primary",
          "data-[separator=active]:bg-primary",
          "data-[separator=dragging]:bg-primary",
          "[&[aria-orientation=vertical]]:w-px [&[aria-orientation=vertical]]:cursor-col-resize",
        )}
      />
      <Panel
        id={STUDIO_SIDEBAR_PANEL_IDS.main}
        style={{ overflow: "hidden", height: "100%" }}
      >
        <div className="relative flex h-full min-h-0 flex-col">
          {collapsed && (
            <button
              type="button"
              onClick={() => sidebarPanelRef.current?.expand()}
              title="Show sessions sidebar"
              aria-label="Show sessions sidebar"
              className="absolute left-1 top-1 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/80 text-muted-foreground shadow-sm hover:bg-accent hover:text-foreground"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
          )}
          {main}
        </div>
      </Panel>
    </Group>
  ) : (
    noSidebarLayout
  );

  const mobilePanels: MobileShellPanel[] = showSidebar
    ? [
        {
          id: "sidebar",
          label: "Sessions",
          icon: Layers,
          content: (
            <StudioSidebar className="h-full" navigateToSession={navigateToSession} />
          ),
        },
      ]
    : [];

  return (
    <>
      <PageHeader>
        <TranscriptsListHeader />
      </PageHeader>
      <div
        className={cn(
          "flex h-full min-h-0 w-full overflow-hidden pt-[var(--shell-header-h)]",
          className,
        )}
      >
        {showSidebar ? (
          <MobilePanelShell
            desktop={desktopLayout}
            main={main}
            panels={mobilePanels}
          />
        ) : (
          noSidebarLayout
        )}
      </div>
    </>
  );
}

// Re-export so importers can derive the default layout / read the cookie
// from one entry point.
export {
  STUDIO_SIDEBAR_COOKIE_NAME,
  STUDIO_SIDEBAR_DEFAULT_LAYOUT,
  decodeStudioSidebarCookie,
} from "./resize/studioSidebarCookie";
