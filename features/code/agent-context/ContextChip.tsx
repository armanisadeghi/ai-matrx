"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Brain, Check, FileCode2, Square, SquareCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setEditorContextDisabledTabs } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { selectCodeTabs, selectActiveTabId } from "../redux/tabsSlice";
import type { RootState } from "@/lib/redux/store";

/** Stable reference when a conversation has no `editorContextDisabledTabs` yet (selector must not return `[]`). */
const EMPTY_DISABLED_TABS: string[] = [];

interface ContextChipProps {
  conversationId: string | null | undefined;
  className?: string;
}

/**
 * Compact chip rendered next to the chat header. Shows how many open editor
 * tabs are currently bound to the agent's context, and exposes a popover
 * for toggling individual tabs in/out. Toggles are stored in
 * `instanceUIState.editorContextDisabledTabs` so they persist with the
 * conversation.
 *
 * The chip is intentionally informative (not noisy): it shows
 *   "3/5 tabs"
 * with the active count over the total. Hovering reveals a tooltip; clicking
 * opens the popover.
 */
export const ContextChip: React.FC<ContextChipProps> = ({
  conversationId,
  className,
}) => {
  const dispatch = useAppDispatch();
  const tabsState = useAppSelector(selectCodeTabs);
  const activeId = useAppSelector(selectActiveTabId);
  const editorContextDisabledRaw = useAppSelector((state: RootState) => {
    if (!conversationId) return undefined;
    return state.instanceUIState?.byConversationId?.[conversationId]
      ?.editorContextDisabledTabs;
  });
  const disabled = editorContextDisabledRaw ?? EMPTY_DISABLED_TABS;

  const tabs = useMemo(
    () =>
      tabsState.order
        .map((id) => tabsState.byId[id])
        .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab)),
    [tabsState],
  );

  const disabledSet = useMemo(() => new Set(disabled), [disabled]);
  const includedCount = tabs.filter((t) => !disabledSet.has(t.id)).length;

  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  if (!conversationId || tabs.length === 0) return null;

  const toggleTab = (tabId: string) => {
    const next = disabledSet.has(tabId)
      ? disabled.filter((id) => id !== tabId)
      : [...disabled, tabId];
    dispatch(
      setEditorContextDisabledTabs({
        conversationId,
        tabIds: next,
      }),
    );
  };

  const toggleAll = (include: boolean) => {
    dispatch(
      setEditorContextDisabledTabs({
        conversationId,
        tabIds: include ? [] : tabs.map((t) => t.id),
      }),
    );
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`${includedCount} of ${tabs.length} editor tabs in context`}
        className={cn(
          "flex h-6 items-center gap-1 rounded-sm border px-1.5 text-[10px]",
          includedCount > 0
            ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300"
            : "border-neutral-300 bg-white text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800",
        )}
      >
        <Brain size={10} />
        <span className="font-mono tabular-nums">
          {includedCount}/{tabs.length}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-30 min-w-[260px] max-w-[420px] rounded-md border border-neutral-300 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-950">
          <div className="flex items-center justify-between border-b border-neutral-200 px-2 py-1.5 dark:border-neutral-800">
            <span className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
              Editor context
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => toggleAll(true)}
                className="rounded-sm px-1.5 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => toggleAll(false)}
                className="rounded-sm px-1.5 py-0.5 text-[10px] text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              >
                None
              </button>
            </div>
          </div>
          <ul className="max-h-[280px] overflow-y-auto py-1">
            {tabs.map((tab) => {
              const enabled = !disabledSet.has(tab.id);
              return (
                <li key={tab.id}>
                  <button
                    type="button"
                    onClick={() => toggleTab(tab.id)}
                    className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[12px] hover:bg-neutral-100 dark:hover:bg-neutral-800/70"
                  >
                    {enabled ? (
                      <SquareCheck
                        size={12}
                        className="shrink-0 text-blue-500"
                      />
                    ) : (
                      <Square size={12} className="shrink-0 text-neutral-400" />
                    )}
                    <FileCode2
                      size={12}
                      className="shrink-0 text-neutral-500"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {tab.name}
                      {tab.dirty && (
                        <span className="ml-1 text-[10px] text-amber-500">
                          •
                        </span>
                      )}
                    </span>
                    {activeId === tab.id && (
                      <Check size={11} className="shrink-0 text-blue-500" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
