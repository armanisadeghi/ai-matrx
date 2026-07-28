import Link from "next/link";

const FOOTER_LINKS = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-and-conditions", label: "Terms & Conditions" },
  { href: "/contact", label: "Contact" },
] as const;

/**
 * Shared footer for every public-facing page. Kept to a single slim row so
 * it can live inside the (public) layout's fixed-height shell without
 * stealing meaningful space from full-screen surfaces.
 */
export function PublicFooter() {
  return (
    <footer
      data-public-footer
      className="w-full shrink-0 border-t border-border bg-card"
    >
      <div className="w-full px-4 py-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
        <span className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} AI Matrx
        </span>
        {FOOTER_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {label}
          </Link>
        ))}
      </div>
    </footer>
  );
}
