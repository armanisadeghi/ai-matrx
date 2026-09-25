// ─────────────────────────────────────────────────────────────────────────
// The rich-content VARIANT — typography only, never a second renderer.
//
// `default` is the chat density every level renders today. `reading` is for
// long-form public reading (learn articles, share pages, public resources):
// larger body text, a ~70ch measure, comfortable line-height and a real
// heading scale. The element maps and markup are IDENTICAL in both variants;
// the variant is one wrapper attribute plus one scoped stylesheet.
//
// Why a scoped stylesheet and not descendant utilities (`[&_p]:text-base`):
// the prose elements carry their own size classes (`text-sm` from
// getDirectionFontSize), so a parent utility only wins by selector
// specificity inside Tailwind's utilities layer — order- and
// specificity-fragile, and one lane's element class change silently breaks
// it. This sheet is UNLAYERED, and unlayered CSS outranks every layered
// Tailwind utility regardless of specificity or order: the variant always
// applies. (Diagnosis of the 2026-09-24 "size change didn't apply": the
// utility was never in the stylesheet at all — the dev build was failing on a
// syntax error in content-splitter-core.ts, so Turbopack kept serving the
// previous CSS. With a healthy build the same utility applied. See
// components/rich-content/FEATURE.md.)
//
// Environment-neutral: rendered by the server level, the static prose leaf
// and the client standard level alike (parity guard covers `reading`).
// ─────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import type { RichContentVariant } from "../rich-content-types";

const R = '[data-rc-variant="reading"]';

/** The reading variant's scoped, unlayered stylesheet. */
export const READING_VARIANT_CSS = `
${R}{font-size:1.125rem;max-width:70ch;margin-inline:auto;color:hsl(var(--foreground));}
${R} .math-content-wrapper{margin-block:0;}
${R} p,${R} li{font-size:1.125rem;line-height:1.75;}
${R} p{margin-bottom:1.15em;}
${R} li{margin-bottom:0.35em;}
${R} ul,${R} ol{margin-bottom:1.15em;}
${R} blockquote{font-size:1.125rem;line-height:1.7;margin-block:1.5em;}
${R} blockquote p{margin-bottom:0.5em;}
${R} h1,${R} h2,${R} h3,${R} h4{color:hsl(var(--foreground));font-weight:700;letter-spacing:-0.01em;}
${R} h1{font-size:2rem;line-height:1.2;margin:2.2em 0 0.6em;}
${R} h2{font-size:1.5rem;line-height:1.3;margin:2em 0 0.6em;}
${R} h3{font-size:1.25rem;line-height:1.4;margin:1.6em 0 0.5em;}
${R} h4{font-size:1.125rem;line-height:1.5;margin:1.4em 0 0.4em;}
${R} > :first-child h1:first-child,${R} > :first-child h2:first-child{margin-top:0;}
${R} table{font-size:1rem;}
${R} hr{margin-block:2.5em;}
`;

/** Wraps a level's output in its variant. `default` adds nothing. */
export function RichContentVariantRoot({
  variant = "default",
  children,
}: {
  variant?: RichContentVariant;
  children: ReactNode;
}) {
  if (variant !== "reading") return <>{children}</>;
  return (
    <div data-rc-variant="reading">
      <style dangerouslySetInnerHTML={{ __html: READING_VARIANT_CSS }} />
      {children}
    </div>
  );
}
