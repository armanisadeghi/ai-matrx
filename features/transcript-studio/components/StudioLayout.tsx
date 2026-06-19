"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Menu, PanelLeftOpen } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
import { useAppSelector } from "@/lib/redux/hooks";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  // Render-once mobile/desktop branch so `<ActiveSessionView>` mounts at
  // most once. (Rendering both branches with display:none causes the
  // session view + global header portal to fire twice — confirmed via
  // duplicated children in #page-specific-header-content.)
  const isMobile = useIsMobile();

  // Hydration gate — same reasoning as StudioSidebar. Server renders with
  // empty store (no active session) so the empty-state placeholder lands
  // in the SSR HTML; client gets seeds + initialSessionId via the hydrator
  // post-mount and would otherwise render `<ActiveSessionView>` instead.
  // We render the loading shell on both server and the first client paint
  // so hydration matches, then flip after.
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => setIsHydrated(true), []);

  const closeMobileSidebar = () => setMobileSidebarOpen(false);

  const main = (
    <main className="flex h-full flex-1 min-w-0 flex-col">
      {showSidebar && (
        <div className="flex shrink-0 items-center border-b border-border bg-textured h-9 md:hidden">
          <Button
            variant="ghost"
            size="icon"
            className="m-1 h-7 w-7"
            aria-label="Open studio sidebar"
            onClick={() => setMobileSidebarOpen(true)}
          >
            <Menu className="h-3.5 w-3.5" />
          </Button>
          <MatrxDynamicPanelHost
            open={mobileSidebarOpen}
            onOpenChange={setMobileSidebarOpen}
            title="Transcript Studio"
            position="left"
            defaultSize={80}
            contentClassName="flex min-h-0 flex-1 flex-col p-0 pb-safe"
          >
            <StudioSidebar
              className="h-full"
              onPickSession={closeMobileSidebar}
              onCreateSession={closeMobileSidebar}
              navigateToSession={navigateToSession}
            />
          </MatrxDynamicPanelHost>
          {isHydrated && activeSession && (
            <div className="flex-1 truncate px-2 text-xs font-medium text-foreground">
              {activeSession.title}
            </div>
          )}
        </div>
      )}

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
        {showSidebar && !isMobile ? (
          <Group
            id={STUDIO_SIDEBAR_GROUP_ID}
            orientation="horizontal"
            defaultLayout={
              defaultSidebarLayout ?? STUDIO_SIDEBAR_DEFAULT_LAYOUT
            }
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
                if (wasCollapsed !== isCollapsedNow)
                  setCollapsed(isCollapsedNow);
              }}
              style={{ overflow: "hidden", height: "100%" }}
            >
              <StudioSidebar
                className="h-full"
                onPickSession={closeMobileSidebar}
                onCreateSession={closeMobileSidebar}
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
          // Mobile (or no sidebar): single-branch render. The mobile sidebar
          // lives in the Sheet inside `main`.
          <div className="flex flex-1 min-w-0">{main}</div>
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
