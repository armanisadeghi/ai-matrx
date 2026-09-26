"use client";

// components/rich-editor/panels/FindReplacePanel.tsx
//
// Find & replace for whichever view is showing. Protected content (kinds,
// XML sections, code, math, {{variables}}…) is skipped unless the person turns
// "Include protected content" on — and the panel says how many matches it
// skipped, so nothing is silently missing.

import { useEffect, useRef, useState } from "react";
import { CaseSensitive, ChevronDown, ChevronUp, Regex, ShieldAlert, WholeWord, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FindOptions } from "../core/find-replace";
import type { ViewFindState } from "../visual/VisualEditor";

export interface FindReplacePanelProps {
  showReplace: boolean;
  onFind: (query: string, options: FindOptions, step?: 1 | -1) => ViewFindState;
  onReplace: (query: string, replacement: string, options: FindOptions) => void;
  onReplaceAll: (query: string, replacement: string, options: FindOptions) => number;
  onClose: () => void;
}

function Toggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={on}
      onClick={onClick}
      className={cn("flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted", on && "bg-primary/15 text-primary")}
    >
      {children}
    </button>
  );
}

export function FindReplacePanel({ showReplace, onFind, onReplace, onReplaceAll, onClose }: FindReplacePanelProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [options, setOptions] = useState<FindOptions>({});
  const [state, setState] = useState<ViewFindState>({ count: 0, current: -1, skippedProtected: 0, error: null });
  const [replacing, setReplacing] = useState(showReplace);
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => setReplacing((value) => value || showReplace), [showReplace]);
  useEffect(() => input.current?.focus(), []);
  useEffect(() => {
    setState(onFind(query, options));
    setNotice(null);
  }, [query, options, onFind]);

  const step = (direction: 1 | -1) => setState(onFind(query, options, direction));
  const toggle = (key: keyof FindOptions) => setOptions((current) => ({ ...current, [key]: !current[key] }));

  const summary = state.error
    ? state.error
    : !query
      ? "Type to find"
      : state.count === 0
        ? "No matches"
        : `${state.current + 1} of ${state.count}`;

  return (
    <div
      // A floating widget over the text's top-right corner (VS Code's find widget),
      // never a row that pushes the document down (UI audit B, 2026-09-26).
      className="matrx-touch-targets absolute inset-x-2 top-full z-30 mt-1 flex flex-col gap-1.5 rounded-lg border border-border bg-popover/95 px-2 py-1.5 text-sm shadow-lg backdrop-blur sm:left-auto sm:w-[34rem] sm:max-w-[calc(100%-1rem)]"
      role="search"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          ref={input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") step(event.shiftKey ? -1 : 1);
          }}
          placeholder="Find"
          aria-label="Find"
          // A phone gives the search term its own full row; the count and the
          // toggles wrap below it (it was squeezed to 49 px, verify-RC-B4 R3-6).
          className="h-8 w-full min-w-0 rounded-md border border-border bg-background px-2 text-base sm:w-auto sm:flex-1 sm:text-sm"
        />
        <span className={cn("shrink-0 text-xs text-muted-foreground sm:w-24", state.error && "text-destructive")} aria-live="polite">
          {summary}
        </span>
        <Toggle on={Boolean(options.caseSensitive)} onClick={() => toggle("caseSensitive")} label="Match case">
          <CaseSensitive className="h-4 w-4" />
        </Toggle>
        <Toggle on={Boolean(options.wholeWord)} onClick={() => toggle("wholeWord")} label="Whole words">
          <WholeWord className="h-4 w-4" />
        </Toggle>
        <Toggle on={Boolean(options.regex)} onClick={() => toggle("regex")} label="Regular expression">
          <Regex className="h-4 w-4" />
        </Toggle>
        <Toggle on={Boolean(options.includeProtected)} onClick={() => toggle("includeProtected")} label="Include protected content (kinds, code, variables…)">
          <ShieldAlert className="h-4 w-4" />
        </Toggle>
        <button type="button" className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted" onClick={() => step(-1)} aria-label="Previous match">
          <ChevronUp className="h-4 w-4" />
        </button>
        <button type="button" className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted" onClick={() => step(1)} aria-label="Next match">
          <ChevronDown className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-muted"
          onClick={() => setReplacing((value) => !value)}
          aria-expanded={replacing}
        >
          Replace
        </button>
        <button type="button" className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted" onClick={onClose} aria-label="Close find">
          <X className="h-4 w-4" />
        </button>
      </div>
      {replacing && (
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            placeholder={options.regex ? "Replace with ($1 for groups)" : "Replace with"}
            aria-label="Replace with"
            className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-base sm:text-sm"
          />
          <button
            type="button"
            disabled={state.count === 0}
            className="h-8 rounded-md border border-border px-3 text-xs hover:bg-muted disabled:opacity-50"
            onClick={() => {
              onReplace(query, replacement, options);
              setState(onFind(query, options));
            }}
          >
            Replace
          </button>
          <button
            type="button"
            disabled={state.count === 0}
            className="h-8 rounded-md border border-border px-3 text-xs hover:bg-muted disabled:opacity-50"
            onClick={() => {
              const replaced = onReplaceAll(query, replacement, options);
              setNotice(`Replaced ${replaced} ${replaced === 1 ? "match" : "matches"}.`);
              setState(onFind(query, options));
            }}
          >
            Replace all
          </button>
        </div>
      )}
      {(state.skippedProtected > 0 || notice) && (
        <p className="text-xs text-muted-foreground">
          {notice}
          {notice && state.skippedProtected > 0 ? " " : ""}
          {state.skippedProtected > 0 &&
            `${state.skippedProtected} more ${state.skippedProtected === 1 ? "match is" : "matches are"} inside protected content and left alone — turn on the shield to include them.`}
        </p>
      )}
    </div>
  );
}
