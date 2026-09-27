import Link from "next/link";
import { siteConfig } from "@/config/extras/site";
import { MATRX_LOCAL_DOWNLOAD_PATH } from "@/features/matrx-local-download/release";

const FOOTER_LINKS = [
  { href: MATRX_LOCAL_DOWNLOAD_PATH, label: "Download" },
  { href: "/how-it-works", label: "How It Works" },
  { href: "/why-ai-matrx", label: "Why AI Matrx" },
  { href: "/how-we-prove-it", label: "How We Prove It" },
  { href: "/the-landscape", label: "The Landscape" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-of-service", label: "Terms of Service" },
  { href: "/contact", label: "Contact" },
] as const;

/**
 * Shared footer for every public-facing page. One slim row at xl+ so it can
 * live inside the (public) layout's fixed-height shell without stealing space
 * from full-screen surfaces; a tidy grid on phones instead of ragged wrapping.
 */
export function PublicFooter() {
  return (
    <footer
      data-public-footer
      className="w-full shrink-0 border-t border-border bg-card"
    >
      {/* Two groups so nothing orphans: at xl+ one row (legal left, links
          right, links never wrap); below xl the links form an even grid and
          the legal line sits under them. */}
      <div className="flex w-full flex-col-reverse items-center gap-1 px-4 py-2 xl:flex-row xl:justify-between xl:gap-4">
        <span className="py-2 text-center text-xs text-muted-foreground xl:py-0 xl:text-left">
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
        <nav
          aria-label="Footer"
          className="grid w-full grid-cols-2 sm:grid-cols-4 xl:flex xl:w-auto xl:flex-nowrap xl:items-center"
        >
          {FOOTER_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-md px-2 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:min-h-9"
            >
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
