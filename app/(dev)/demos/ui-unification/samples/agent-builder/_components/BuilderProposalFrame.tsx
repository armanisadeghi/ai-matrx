"use client";

/**
 * The agent builder sample's frame: the REAL builder, unchanged, plus the
 * owner's note of proposed improvements (owner, 2026-10-03: "this UI was
 * meticulously built to be perfect. Every pixel is accounted for, but it could
 * still be improved if we do it right" — no change to the real builder without
 * his explicit approval).
 *
 * - "Original" (the default) renders the builder exactly as /agents/[id]/build.
 * - "Preview" applies ONLY the proposals marked `previewed` as scoped CSS on
 *   this wrapper (`[data-uk-builder-preview]`). Nothing outside this page
 *   changes, and no builder file is edited. Proposals that need a code change
 *   (not just CSS) are listed but not previewed.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { SampleScale } from "../../_components/kit";
import { ReplacesLine } from "../../_components/replaces-line";

interface Proposal {
  text: string;
  previewed: boolean;
}

/** One line each. `previewed` = the Preview toggle shows it on this page. */
const PROPOSALS: Proposal[] = [
  { text: "Cursor law: pointer on every enabled control, not-allowed on disabled ones.", previewed: true },
  { text: "One control: the panel toolbars' buttons and selects paint at 28px.", previewed: true },
  { text: "Capsule shape on text buttons and selects (16px glyphs, matched inset).", previewed: true },
  { text: "Section headings at 13px/600; helper lines 12px; meta 11px.", previewed: true },
  { text: "Glass only floats: solid panel toolbars use transparent tap buttons.", previewed: false },
  { text: "Header: sitewide crumbs (Agents › agent › Build) with sibling menus.", previewed: false },
  { text: "Row actions sit left of status chips and reserve no empty slot.", previewed: false },
  { text: "Loading: skeletons shaped like each panel, never a centered spinner.", previewed: false },
];

/* Scoped to the preview wrapper only. Unlayered, so it wins over the builder's
   Tailwind utilities without touching a builder file. Kept deliberately
   narrow: controls and type, never layout. */
const PREVIEW_CSS = `
[data-uk-builder-preview] :is(button, a[href], [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio], [role=menuitem], [role=combobox], summary, select, label[for]):not(:disabled):not([aria-disabled=true]) { cursor: pointer; }
[data-uk-builder-preview] :is(button, [role=button], [role=tab], select, input, textarea):is(:disabled, [aria-disabled=true]) { cursor: not-allowed; }
[data-uk-builder-preview] :is(input:not([type=checkbox]):not([type=radio]):not([type=range]), textarea, [contenteditable=true]):not(:disabled) { cursor: text; }
[data-uk-builder-preview] :is(button, [role=combobox])[class*="h-8"], [data-uk-builder-preview] :is(button, [role=combobox])[class*="h-9"], [data-uk-builder-preview] :is(button, [role=combobox])[class*="h-10"] {
  height: 1.75rem; min-height: 0; border-radius: 9999px; font-size: 0.8125rem; }
[data-uk-builder-preview] :is(button, [role=combobox])[class*="h-8"] svg, [data-uk-builder-preview] :is(button, [role=combobox])[class*="h-9"] svg, [data-uk-builder-preview] :is(button, [role=combobox])[class*="h-10"] svg { width: 1rem; height: 1rem; }
[data-uk-builder-preview] :is(h2, h3)[class*="text-sm"], [data-uk-builder-preview] :is(h2, h3)[class*="text-base"] { font-size: 0.8125rem; font-weight: 600; }
`;

export function BuilderProposalFrame({ realHref, children }: { realHref: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const shown = PROPOSALS.filter((p) => p.previewed).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SampleScale>
        <div className="relative shrink-0 border-b border-border">
          <div className="uc-row py-0.5 pl-3 pr-[9px]" style={{ flexWrap: "nowrap" }}>
            <ReplacesLine href={realHref} className="mx-[3px] min-w-0 flex-1" />
            <button
              type="button"
              className="uc-btn uc-btn-quiet"
              aria-expanded={open}
              aria-controls="builder-proposals"
              onClick={() => setOpen((v) => !v)}
            >
              <ListChecks aria-hidden />
              <span className="max-sm:sr-only">Proposals</span>
              <span className="text-[0.6875rem] text-muted-foreground">{PROPOSALS.length}</span>
              <ChevronDown aria-hidden className={cn("transition-transform", open && "rotate-180")} />
            </button>
            <div className="uc-seg" role="radiogroup" aria-label="Builder view">
              <button
                type="button"
                role="radio"
                aria-checked={!preview}
                className="uc-seg-item"
                data-on={!preview ? "" : undefined}
                onClick={() => setPreview(false)}
              >
                Original
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={preview}
                className="uc-seg-item"
                data-on={preview ? "" : undefined}
                onClick={() => setPreview(true)}
                title={`Applies the ${shown} previewed proposals as scoped CSS`}
              >
                Preview
              </button>
            </div>
          </div>
          {open ? (
            <ol
              id="builder-proposals"
              className="absolute inset-x-3 top-full z-30 mt-1 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-lg"
            >
              {PROPOSALS.map((p, i) => (
                <li key={p.text} className="flex min-h-8 items-center gap-2 px-3 py-1">
                  <span className="w-4 shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 text-xs">{p.text}</span>
                  <span
                    className={cn(
                      "inline-flex h-[1.125rem] shrink-0 items-center rounded-md border px-1.5 text-[0.6875rem] font-medium",
                      p.previewed ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-muted-foreground",
                    )}
                  >
                    {p.previewed ? "In preview" : "Needs code"}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </SampleScale>
      {preview ? <style dangerouslySetInnerHTML={{ __html: PREVIEW_CSS }} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden" data-uk-builder-preview={preview ? "" : undefined}>
        {children}
      </div>
    </div>
  );
}
