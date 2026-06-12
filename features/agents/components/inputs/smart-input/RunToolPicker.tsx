"use client";

/**
 * RunToolPicker — pick registry tools to add to THIS conversation's requests,
 * from the Smart Input controls menu (Tools tab). Additive on top of the
 * agent's own saved tools; stored on `builderAdvancedSettings.addedTools` and
 * folded into the request by `buildToolInjection`. Per-conversation, ephemeral.
 *
 * Reads the shared tools catalog (`selectAllTools`) and ensures it's loaded.
 */

import { useEffect, useState } from "react";
import { Search, X, Check, ChevronDown } from "lucide-react";
import type { DatabaseTool } from "@/utils/supabase/tools-service";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  selectAllTools,
  selectToolsStatus,
} from "@/features/agents/redux/tools/tools.selectors";
import { fetchAvailableTools } from "@/features/agents/redux/tools/tools.thunks";
import { selectBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.selectors";
import { setBuilderAdvancedSettings } from "@/features/agents/redux/execution-system/instance-ui-state/instance-ui-state.slice";
import { DEFAULT_BUILDER_ADVANCED_SETTINGS } from "@/features/agents/types/instance.types";
import { filterAndSortBySearch } from "@/utils/search-scoring";

export function RunToolPicker({ conversationId }: { conversationId: string }) {
  const dispatch = useAppDispatch();
  const tools = useAppSelector(selectAllTools);
  const status = useAppSelector(selectToolsStatus);
  const settings =
    useAppSelector(selectBuilderAdvancedSettings(conversationId)) ??
    DEFAULT_BUILDER_ADVANCED_SETTINGS;
  const addedList = settings.addedTools ?? [];
  const added = new Set(addedList);
  const [search, setSearch] = useState("");
  // Accordion: one description open at a time keeps the list scannable.
  const [expandedToolId, setExpandedToolId] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "succeeded" && status !== "loading") {
      void dispatch(fetchAvailableTools());
    }
  }, [status, dispatch]);

  const setAdded = (next: string[]) =>
    dispatch(
      setBuilderAdvancedSettings({
        conversationId,
        changes: { addedTools: next },
      }),
    );

  const toggle = (id: string) =>
    setAdded(
      added.has(id) ? addedList.filter((t) => t !== id) : [...addedList, id],
    );

  // No useMemo — React Compiler memoizes (CLAUDE.md core invariant).
  const list = tools ?? [];
  const visible = !search.trim()
    ? // Selected first so the user can see/remove their picks at a glance.
      [
        ...list.filter((t) => added.has(t.id)),
        ...list.filter((t) => !added.has(t.id)),
      ]
    : filterAndSortBySearch(list, search, [
        { get: (t) => t.name, weight: "title" },
        { get: (t) => t.description, weight: "body" },
        { get: (t) => t.category, weight: "tag" },
      ]);

  const loadingEmpty = status === "loading" && (tools?.length ?? 0) === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-2 pb-1.5 pt-2">
        <p className="mb-1.5 text-[11px] leading-tight text-muted-foreground">
          Add tools to this run — on top of the agent&apos;s own tools.
          {added.size > 0 && (
            <span className="ml-1 font-medium text-primary">
              {added.size} added
            </span>
          )}
        </p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools…"
            className="h-7 pl-7 pr-7 text-xs"
            style={{ fontSize: "16px" }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {loadingEmpty ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            Loading tools…
          </p>
        ) : visible.length === 0 ? (
          <p className="px-3 py-3 text-xs text-muted-foreground">
            {search ? `No tools match "${search}"` : "No tools available."}
          </p>
        ) : (
          visible.map((t) => (
            <ToolRow
              key={t.id}
              tool={t}
              selected={added.has(t.id)}
              expanded={expandedToolId === t.id}
              onToggle={() => toggle(t.id)}
              onToggleExpand={() =>
                setExpandedToolId((cur) => (cur === t.id ? null : t.id))
              }
            />
          ))
        )}
      </div>

      {added.size > 0 && (
        <div className="shrink-0 border-t border-border px-2 py-1.5">
          <button
            type="button"
            onClick={() => setAdded([])}
            className="text-[10px] text-muted-foreground hover:text-destructive"
          >
            Clear {added.size} added tool{added.size === 1 ? "" : "s"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Single-line tool row: checkbox + name + expand chevron. Clicking the row
 * toggles selection; the chevron expands the full description below. The row
 * is a div[role=button] (not <button>) so the chevron can be a real button —
 * nested buttons are invalid HTML.
 */
function ToolRow({
  tool,
  selected,
  expanded,
  onToggle,
  onToggleExpand,
}: {
  tool: DatabaseTool;
  selected: boolean;
  expanded: boolean;
  onToggle: () => void;
  onToggleExpand: () => void;
}) {
  return (
    <div className={cn(selected && "bg-primary/5")}>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="flex h-8 w-full cursor-pointer items-center gap-2 px-2.5 text-left transition-colors hover:bg-accent/60"
      >
        <span
          className={cn(
            "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border",
            selected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40",
          )}
        >
          {selected && <Check className="h-2.5 w-2.5" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {tool.name}
        </span>
        {tool.description && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide description" : "Show description"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        )}
      </div>
      {expanded && tool.description && (
        <p className="px-2.5 pb-1.5 pl-8 text-[11px] leading-snug text-muted-foreground">
          {tool.description}
        </p>
      )}
    </div>
  );
}
