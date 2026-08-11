import Link from "next/link";
import { siteConfig } from "@/config/extras/site";

const FOOTER_LINKS = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-of-service", label: "Terms of Service" },
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
      <div className="flex w-full flex-wrap items-center justify-center gap-x-1 px-2 py-1 sm:gap-x-2 sm:px-4">
        <span className="px-2 text-xs text-muted-foreground">
          © {new Date().getFullYear()} AI Matrx · Operated by{" "}
          <a
            href={siteConfig.legalOperatorUrl}
            rel="external noopener"
            target="_blank"
            className="hover:text-foreground"
          >
            {siteConfig.legalOperatorName}
          </a>
        </span>
        {FOOTER_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className="inline-flex min-h-11 items-center rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label}
          </Link>
        ))}
      </div>
    </footer>
  );
}
