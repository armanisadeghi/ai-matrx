// features/portals/look.ts — WHOSE PORTAL THIS IS, BEFORE SHE TYPES ANYTHING (lane S6, U12).
//
// The champion is Softr's branded client portal: the business's logo, its name and its colour on
// the sign-in page a client opens from a text message, and the same on every screen after. The
// store resolves the look (`custom._portal_style`): the portal's own values over the
// organization's brand, so a portal with no look of its own shows the organization's name and is
// never blank. This module only turns that answer into what the page draws; it adds nothing.
//
// Colour is a design-system NAME (`STYLE_COLORS`), never a hex: each name ships its own light and
// dark class, so a portal is legible on both grounds and a retired name degrades to "no colour".
// Pure, no I/O (`__tests__/look.test.ts`).

// The server-safe subpath (design-system 0.39+), NOT `@ai-matrx/design-system/data-table`: that
// one is a "use client" barrel, so on the server (every portal page is server-rendered) its
// constants arrive as client references and every accent silently read as "no colour".
import { ROW_TINT_CLASS, SWATCH_CLASS } from "@ai-matrx/design-system/data-table/table-style";

import type { PortalStyle } from "./service";

export interface PortalLook {
  /** What the business is called here. Never empty. */
  name: string;
  welcome: string | null;
  /** The logo's public address, or null (the page then shows the name's first letter). */
  logoUrl: string | null;
  /** The accent band's class, or null for the app's own colour. */
  bandClass: string | null;
  /** A soft tint for the portal's own call-to-action rows, or null. */
  tintClass: string | null;
  /** The logo tile's fallback background (the accent, or the app's primary). */
  monogramClass: string;
  footerLinks: Array<{ label: string; href: string; external: boolean }>;
  /** A cover picture's public address, or null (no cover band). */
  coverUrl: string | null;
  /**
   * The accent as the app's own primary colour (buttons, progress, focus ring) for a page that
   * should wear it — a public form (MAKE-HOME W5). Null for the app's own colour.
   */
  primaryVars: Record<string, string> | null;
}

/**
 * Each accent as the theme's `--primary` triplet (`h s% l%`, the shape `app/globals.css` reads
 * through `hsl(var(--primary))`), dark enough for white text on both grounds.
 */
const ACCENT_PRIMARY: Record<string, string> = {
  slate: "215 19% 35%",
  green: "142 72% 29%",
  amber: "32 95% 40%",
  red: "0 72% 45%",
  blue: "221 83% 50%",
  violet: "262 83% 55%",
  teal: "175 84% 30%",
};

/** Only the three kinds of address the store accepts (`https://`, `mailto:`, `tel:`). */
function safeHref(url: string): string | null {
  const u = url.trim();
  if (/^https:\/\//i.test(u)) return u;
  if (/^mailto:/i.test(u)) return u;
  if (/^tel:/i.test(u)) return `tel:${u.slice(4).replace(/[^\d+]/g, "")}`;
  return null;
}

/**
 * The look a page draws. `fallbackName` is the organization's name as the older doors answer it,
 * used only when a database older than lane S6 sends no style at all.
 */
export function portalLook(style: PortalStyle | null | undefined, fallbackName: string): PortalLook {
  const accent = style?.accent && style.accent in SWATCH_CLASS ? style.accent : null;
  const name = (style?.display_name ?? "").trim() || fallbackName.trim() || "Client portal";
  const logo = style?.logo_url && /^https:\/\//i.test(style.logo_url) ? style.logo_url : null;
  const links = Array.isArray(style?.footer_links) ? style.footer_links : [];
  return {
    name,
    welcome: (style?.welcome ?? "").trim() || null,
    logoUrl: logo,
    bandClass: accent ? SWATCH_CLASS[accent] : null,
    tintClass: accent ? ROW_TINT_CLASS[accent] : null,
    monogramClass: accent ? `${SWATCH_CLASS[accent]} text-white` : "bg-primary text-primary-foreground",
    coverUrl: style?.cover_url && /^https:\/\//i.test(style.cover_url) ? style.cover_url : null,
    primaryVars:
      accent && ACCENT_PRIMARY[accent]
        ? {
            // The triplets AND the resolved colours: `--color-primary` is computed where it is
            // declared (the root), so overriding only `--primary` below it changes nothing.
            "--primary": ACCENT_PRIMARY[accent],
            "--primary-foreground": "0 0% 100%",
            "--ring": ACCENT_PRIMARY[accent],
            "--color-primary": `hsl(${ACCENT_PRIMARY[accent]})`,
            "--color-primary-foreground": "hsl(0 0% 100%)",
            "--color-ring": `hsl(${ACCENT_PRIMARY[accent]})`,
          }
        : null,
    footerLinks: links
      .map((l) => ({ label: (l?.label ?? "").trim(), href: safeHref(l?.url ?? "") }))
      .filter((l): l is { label: string; href: string } => Boolean(l.label && l.href))
      .map((l) => ({ ...l, external: l.href.startsWith("https://") })),
  };
}

/** The first letter of the business's name, for a portal with no logo. */
export function monogram(name: string): string {
  const letter = name.trim().match(/[\p{L}\p{N}]/u)?.[0];
  return (letter ?? "·").toUpperCase();
}
