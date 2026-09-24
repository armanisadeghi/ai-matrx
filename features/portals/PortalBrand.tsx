// features/portals/PortalBrand.tsx — the business's own name, logo and colour, drawn the same on
// every portal screen (lane S6, U12). Server-rendered at a fixed size, so the first paint is the
// real screen: the logo box is reserved before the picture arrives and nothing shifts.
//
// Built from what the store resolved (`look.ts`); it adds no rule of its own.

import Link from "next/link";

import { monogram, type PortalLook } from "./look";

/** The thin accent band across the top of a portal screen, or nothing for the app's colour. */
export function PortalAccentBand({ look }: { look: PortalLook }) {
  if (!look.bandClass) return null;
  return <div aria-hidden className={`fixed inset-x-0 top-0 z-10 h-1 ${look.bandClass}`} />;
}

/** The logo tile: the business's picture, or its first letter on its colour. */
export function PortalLogo({ look, size = "md" }: { look: PortalLook; size?: "sm" | "md" }) {
  const box = size === "sm" ? "h-9 w-9 text-sm" : "h-12 w-12 text-lg";
  if (look.logoUrl) {
    return (
      // A public picture on the CDN, sized by its box: one small image, fixed dimensions.
      <img
        src={look.logoUrl}
        alt={`${look.name} logo`}
        width={size === "sm" ? 36 : 48}
        height={size === "sm" ? 36 : 48}
        className={`${box} shrink-0 rounded-lg border border-border bg-card object-contain`}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`${box} inline-flex shrink-0 items-center justify-center rounded-lg font-semibold ${look.monogramClass}`}
    >
      {monogram(look.name)}
    </span>
  );
}

/** The heading block: logo, the business's name, and (optionally) its welcome line. */
export function PortalBrandHeading({
  look,
  withWelcome = true,
}: {
  look: PortalLook;
  withWelcome?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <PortalLogo look={look} />
      <div className="min-w-0">
        <p className="truncate text-base font-semibold tracking-tight text-foreground">{look.name}</p>
        {withWelcome && look.welcome ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{look.welcome}</p>
        ) : null}
      </div>
    </div>
  );
}

/** The footer: the business's own links (call, email, website), or nothing when it set none. */
export function PortalFooter({ look }: { look: PortalLook }) {
  if (look.footerLinks.length === 0) return null;
  return (
    <footer className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 pb-6 text-sm text-muted-foreground">
      {look.footerLinks.map((link) =>
        link.external ? (
          <Link
            key={`${link.label}-${link.href}`}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            data-tap-target
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {link.label}
          </Link>
        ) : (
          <a
            key={`${link.label}-${link.href}`}
            href={link.href}
            data-tap-target
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            {link.label}
          </a>
        ),
      )}
    </footer>
  );
}
