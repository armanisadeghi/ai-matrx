"use client";

import React, { useCallback, useDeferredValue, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import type { EditorFile } from "../types";
import { selectTabById } from "../redux/tabsSlice";
import { getAdapterForTabId } from "../library-sources/registry";
import {
  getRenderPreviewerForTabId,
  type RenderPreviewer,
} from "./renderPreviewRegistry";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface RenderPreviewViewProps {
  tab: EditorFile;
}

/**
 * Body of a `kind === "render-preview"` tab. Reads the live buffer of
 * the paired source tab from Redux, looks up the registered previewer
 * for that source's library-source adapter, and renders it. Edits in
 * the source Monaco propagate here automatically (debounced via
 * `useDeferredValue`); a Refresh button forces an immediate remount in
 * case the previewer caches state.
 *
 * If the source tab has been closed, or no previewer is registered for
 * its prefix, an empty-state explains why.
 */
export const RenderPreviewView: React.FC<RenderPreviewViewProps> = ({
  tab,
}) => {
  const sourceTabId = tab.renderSourceTabId ?? "";
  const sourceTab = useAppSelector(selectTabById(sourceTabId));
  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (!sourceTabId) {
    return (
      <PreviewEmpty
        icon={<AlertTriangle size={36} strokeWidth={1.2} />}
        title="No source tab linked"
        body="This preview tab has no source file to render."
      />
    );
  }

  if (!sourceTab) {
    return (
      <PreviewEmpty
        icon={<AlertTriangle size={36} strokeWidth={1.2} />}
        title="Source file is closed"
        body="Reopen the source file to bring the live preview back."
      />
    );
  }

  const Previewer = getRenderPreviewerForTabId(sourceTab.id);
  if (!Previewer) {
    return (
      <PreviewEmpty
        icon={<AlertTriangle size={36} strokeWidth={1.2} />}
        title="No preview available for this file type"
        body="No render-preview component is registered for this source."
      />
    );
  }

  const adapter = getAdapterForTabId(sourceTab.id);
  const parsed = adapter?.parseTabId(sourceTab.id) ?? null;
  if (!parsed) {
    return (
      <PreviewEmpty
        icon={<AlertTriangle size={36} strokeWidth={1.2} />}
        failed
        title="Could not resolve source row"
        body={`The library adapter could not parse "${sourceTab.id}".`}
      />
    );
  }

  return (
    <RenderPreviewBody
      Previewer={Previewer}
      sourceTab={sourceTab}
      rowId={parsed.rowId}
      fieldId={parsed.fieldId}
      refreshKey={refreshKey}
      onRefresh={handleRefresh}
    />
  );
};

interface RenderPreviewBodyProps {
  Previewer: RenderPreviewer;
  sourceTab: EditorFile;
  rowId: string;
  fieldId?: string;
  refreshKey: number;
  onRefresh: () => void;
}

const RenderPreviewBody: React.FC<RenderPreviewBodyProps> = ({
  Previewer,
  sourceTab,
  rowId,
  fieldId,
  refreshKey,
  onRefresh,
}) => {
  // Defer keystroke-rate buffer changes so we don't run the (expensive)
  // Babel transform on every character. React batches updates from low
  // priority work, which gives us de-facto debouncing without taking on
  // a manual timeout.
  const liveCode = useDeferredValue(sourceTab.content);
  const isStale = liveCode !== sourceTab.content;

  return (
    <div className="flex h-full w-full min-h-0 flex-col">
      <div
        className={cn(
          "flex h-8 shrink-0 items-center justify-between gap-2 border-b border-neutral-200 bg-neutral-50 px-3 text-[12px] dark:border-neutral-800 dark:bg-neutral-900",
        )}
      >
        <div className="flex min-w-0 items-center gap-2 text-neutral-500 dark:text-neutral-400">
          <span className="truncate">Preview · {sourceTab.name}</span>
          {isStale ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
              Updating…
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="flex items-center gap-1.5 rounded px-2 py-1 text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-neutral-50"
          title="Re-run preview from current buffer"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>
      <div className="relative flex-1 min-h-0 overflow-auto">
        <Previewer
          key={refreshKey}
          rowId={rowId}
          fieldId={fieldId}
          code={liveCode}
          sourceTabId={sourceTab.id}
          language={sourceTab.language}
        />
      </div>
    </div>
  );
};

interface PreviewEmptyProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  /** This state is a failure: its title line carries the Alchemy Menu. */
  failed?: boolean;
}

const PreviewEmpty: React.FC<PreviewEmptyProps> = ({ icon, title, body, failed }) => (
  <div className="flex h-full w-full items-center justify-center p-6">
    <div className="flex max-w-sm flex-col items-center gap-3 text-center text-neutral-500 dark:text-neutral-400">
      {icon}
      <div className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
        {title}
        {failed ? <ErrorAlchemyMenu error={`${title}. ${body}`} /> : null}
      </div>
      <p className="text-xs leading-relaxed">{body}</p>
    </div>
  </div>
);
