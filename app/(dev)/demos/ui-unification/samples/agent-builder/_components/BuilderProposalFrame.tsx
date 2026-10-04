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

import { useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import { SampleScale } from "../../_components/kit";

interface Proposal {
  text: string;
  previewed: boolean;
}

/** One line each, measured on the real builder (2026-10-03, 1440px).
 *  `previewed` = the Preview toggle shows it on this page as scoped CSS.
 *  Already true today, so not proposed: every enabled control has the pointer
 *  cursor and disabled ones show not-allowed (the cursor law holds). */
const PROPOSALS: Proposal[] = [
  { text: "\"Add\" and \"Batch add\" grow from 24px to the 28px control, 13px label.", previewed: true },
  { text: "Capsule corners on text buttons and the model select (today 6px).", previewed: true },
  { text: "Message toolbar glyph buttons (20–24px) become one 28px circle.", previewed: true },
  { text: "Tool chips' remove ✕ gets a real hit area (today 12×12px).", previewed: true },
  { text: "Tools row: a \"+N\" chip when chips overflow (10 of 13 are clipped).", previewed: false },
  { text: "Header is solid: the name, mode and version groups drop their glass.", previewed: false },
  { text: "Header: sitewide crumbs (Agents › agent › Build) with sibling menus.", previewed: false },
  { text: "Test-chat bar: 44/32/20px buttons settle on the one 28px control.", previewed: false },
];

/* Scoped to the preview wrapper only. Unlayered, so it wins over the builder's
   Tailwind utilities without touching a builder file. Kept deliberately
   narrow — controls only, never layout — and keyed to the classes and names
   the builder renders today (read off the live page, 2026-10-03). */
const P = "[data-uk-builder-preview]";
const PREVIEW_CSS = `
${P} button.px-2\\.5.py-1.text-xs.rounded-md { height: 1.75rem; padding-block: 0; padding-inline: 0.5rem 0.625rem; border-radius: 9999px; font-size: 0.8125rem; gap: 0.375rem; }
${P} button.px-2\\.5.py-1.text-xs.rounded-md svg { width: 1rem; height: 1rem; }
${P} button.h-7.rounded-md { border-radius: 9999px; padding-inline: 0.625rem; }
${P} :is(button[aria-label="Copy message"], button[aria-label="Clear message"], button[aria-label="Delete message"], button[aria-label="Optimize with AI"], button[aria-label="Cache from here"], button[aria-label="Example"], button[aria-label^="View mode"]) {
  height: 1.75rem; min-width: 1.75rem; border-radius: 9999px; }
${P} :is(button[aria-label="Copy message"], button[aria-label="Clear message"], button[aria-label="Delete message"], button[aria-label="Optimize with AI"], button[aria-label="Cache from here"], button[aria-label="Example"], button[aria-label^="View mode"]) svg { width: 1rem; height: 1rem; }
${P} button[aria-label^="Remove "] { position: relative; }
${P} button[aria-label^="Remove "]::after { content: ""; position: absolute; inset: -8px; }
`;

export function BuilderProposalFrame({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const shown = PROPOSALS.filter((p) => p.previewed).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SampleScale>
        <div className="shrink-0 border-b border-border">
          <div className="uc-row py-0.5 pl-3 pr-[9px]" style={{ flexWrap: "nowrap" }}>
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
              className="mx-3 mb-2 divide-y divide-border overflow-hidden rounded-lg border border-border bg-card"
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
      {/* The real route lets the builder run UNDER the shell header and clear
          it with "padding-top: var(--shell-header-h)"; the demos layout has
          already cleared the header, so the variable is zeroed for this subtree
          only — the builder then sits exactly as it does on its own route. */}
      <div
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
        style={{ "--shell-header-h": "0px" } as CSSProperties}
        data-uk-builder-preview={preview ? "" : undefined}
      >
        {children}
      </div>
    </div>
  );
}
