"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CaseSensitive, ChevronDown, ChevronUp, Regex, Search, WholeWord, X } from "lucide-react";
import { collectRenderedFindRanges, type RenderedFindOptions } from "./renderedFind";

type HighlightRegistry = { set(name: string, value: unknown): void; delete(name: string): void };
type HighlightConstructor = new (...ranges: Range[]) => unknown;

function highlightApi(): { registry: HighlightRegistry; Highlight: HighlightConstructor } | null {
  const css = (window as unknown as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Highlight = (window as unknown as { Highlight?: HighlightConstructor }).Highlight;
  return css?.highlights && Highlight ? { registry: css.highlights, Highlight } : null;
}

function clearHighlights(all: string, active: string) {
  const api = highlightApi();
  api?.registry.delete(all);
  api?.registry.delete(active);
}

/** A read-only find bar for any rendered RichDocument. Never mutates content or selection. */
export function RenderedFindBar({ rootRef, onClose, label = "Find in document", focusRequest = 0, compact = false }: {
  rootRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  label?: string;
  focusRequest?: number;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<RenderedFindOptions>({});
  const [ranges, setRanges] = useState<Range[]>([]);
  const [current, setCurrent] = useState(0);
  const [version, setVersion] = useState(0);
  const instance = useId().replace(/[^a-zA-Z0-9_-]/g, "_");
  const allHighlight = `matrx-rendered-find-${instance}`;
  const activeHighlight = `${allHighlight}-active`;

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);
  useEffect(() => () => clearHighlights(allHighlight, activeHighlight), [allHighlight, activeHighlight]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !query.trim()) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setVersion((value) => value + 1), 150);
    });
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); if (timer) clearTimeout(timer); };
  }, [rootRef, query]);

  useEffect(() => {
    const root = rootRef.current;
    const found = root ? collectRenderedFindRanges(root, query, options) : [];
    setRanges(found);
    setCurrent(0);
  }, [rootRef, query, options, version]);

  useEffect(() => {
    const api = highlightApi();
    if (api) {
      if (ranges.length) api.registry.set(allHighlight, new api.Highlight(...ranges));
      else api.registry.delete(allHighlight);
      const active = ranges[current];
      if (active) api.registry.set(activeHighlight, new api.Highlight(active));
      else api.registry.delete(activeHighlight);
    }
    ranges[current]?.startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [ranges, current, allHighlight, activeHighlight]);

  const step = (direction: number) => {
    if (ranges.length) setCurrent((value) => (value + direction + ranges.length) % ranges.length);
  };
  const toggle = (key: keyof RenderedFindOptions) => setOptions((value) => ({ ...value, [key]: !value[key] }));
  const validRegex = !options.regex || (() => { try { new RegExp(query); return true; } catch { return false; } })();

  return <div role="search" aria-label={label} data-find-ignore="" className={`flex min-w-0 items-center gap-1 rounded-lg border border-border bg-card px-2 py-1 shadow-sm ${compact ? "flex-nowrap" : "flex-wrap"}`}>
    <style>{`::highlight(${allHighlight}) { background-color: rgb(250 204 21 / .5); color: inherit; } ::highlight(${activeHighlight}) { background-color: rgb(249 115 22 / .85); color: white; }`}</style>
    <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    <input ref={inputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
      if (event.key === "Enter") { event.preventDefault(); step(event.shiftKey ? -1 : 1); }
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    }} placeholder={label} aria-label={label} className="min-w-0 flex-1 bg-transparent text-base outline-none md:text-sm" />
    <span className="min-w-12 text-right text-xs tabular-nums text-muted-foreground" aria-live="polite">{!validRegex ? "Invalid pattern" : !query.trim() ? "" : ranges.length ? `${current + 1} of ${ranges.length}` : "No matches"}</span>
    {!compact && <>
      <OptionButton label="Match case" pressed={!!options.caseSensitive} onClick={() => toggle("caseSensitive")}><CaseSensitive className="h-4 w-4" /></OptionButton>
      <OptionButton label="Whole word" pressed={!!options.wholeWord} onClick={() => toggle("wholeWord")}><WholeWord className="h-4 w-4" /></OptionButton>
      <OptionButton label="Regular expression" pressed={!!options.regex} onClick={() => toggle("regex")}><Regex className="h-4 w-4" /></OptionButton>
    </>}
    <OptionButton label="Previous match" disabled={!ranges.length} onClick={() => step(-1)}><ChevronUp className="h-4 w-4" /></OptionButton>
    <OptionButton label="Next match" disabled={!ranges.length} onClick={() => step(1)}><ChevronDown className="h-4 w-4" /></OptionButton>
    <OptionButton label="Close search" onClick={onClose}><X className="h-4 w-4" /></OptionButton>
  </div>;
}

function OptionButton({ label, pressed, disabled, onClick, children }: { label: string; pressed?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary disabled:opacity-40">{children}</button>;
}
