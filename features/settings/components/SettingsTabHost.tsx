"use client";

import { Suspense, Component, type ReactNode } from "react";
import { Loader2, AlertTriangle, Settings as SettingsIcon } from "lucide-react";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsBreadcrumb } from "@/components/official/settings/tree/SettingsBreadcrumb";
import type { SettingsTreeNode } from "@/components/official/settings/tree/types";
import type { SettingsTabDef } from "../types";

type SettingsTabHostProps = {
  activeTab: SettingsTabDef | null;
  /** Tree nodes — used for the breadcrumb header. */
  treeNodes: SettingsTreeNode[];
  /** Called when a breadcrumb ancestor is clicked. */
  onNavigate?: (id: string | null) => void;
  /** Whether to show the breadcrumb row in the header. Default true. */
  showBreadcrumb?: boolean;
};

/**
 * Renders the active settings tab with Suspense for lazy loading
 * and an error boundary so a single broken tab can't crash the shell.
 */
export function SettingsTabHost({
  activeTab,
  treeNodes,
  onNavigate,
  showBreadcrumb = true,
}: SettingsTabHostProps) {
  if (!activeTab) {
    return <EmptyState />;
  }

  const TabComponent = activeTab.component;

  return (
    <div className="flex flex-col h-full min-h-0">
      {showBreadcrumb && (
        <div className="shrink-0 border-b border-border/50 px-4 h-10 flex items-center">
          <SettingsBreadcrumb
            nodes={treeNodes}
            activeId={activeTab.id}
            onNavigate={onNavigate}
          />
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <TabErrorBoundary tabLabel={activeTab.label}>
          <Suspense fallback={<TabLoading />}>
            <TabComponent />
          </Suspense>
        </TabErrorBoundary>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <div className="max-w-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <SettingsIcon className="h-6 w-6" />
        </span>
        <h2 className="mt-3 text-base font-semibold text-foreground">
          Choose a setting
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a category from the sidebar to view its settings.
        </p>
      </div>
    </div>
  );
}

function TabLoading() {
  return (
    <div className="flex h-full items-center justify-center py-12">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

type ErrorBoundaryProps = { children: ReactNode; tabLabel: string };
type ErrorBoundaryState = { error: Error | null };

class TabErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    console.error("[SettingsTabHost] tab render failure:", error);
  }

  override render() {
    if (this.state.error) {
      return (
        <div className="p-4">
          <SettingsCallout
            tone="error"
            title={`Couldn't render "${this.props.tabLabel}"`}
          >
            <div className="font-mono text-[11px] break-all">
              {this.state.error.message}
            </div>
            <div className="mt-1 text-xs">
              The other settings tabs still work. Check the browser console for
              the full stack trace.
            </div>
          </SettingsCallout>
        </div>
      );
    }
    return this.props.children;
  }
}
