import Image from "next/image";
import Link from "next/link";

/**
 * The one attribution row a shared-link page (`app/(link)/…`) may carry.
 *
 * A stranger who opened a link somebody sent gets the thing they were sent,
 * not the marketing site — but a page that takes their input still names who
 * runs it and where its privacy and terms live. One slim row, the way a
 * Typeform or Calendly page ends: "Made with AI Matrx" plus the two legal
 * links. No Download, no Discover, no sign-up pitch.
 */
export function MadeWithAiMatrx() {
  return (
    <footer
      data-made-with
      className="flex w-full shrink-0 items-center justify-center gap-x-1 px-4 pb-safe text-xs text-muted-foreground"
    >
      <Link
        href="/"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Image
          src="/matrx/matrx-icon.svg"
          width={14}
          height={14}
          alt=""
          aria-hidden="true"
        />
        Made with AI Matrx
      </Link>
      <span aria-hidden="true">·</span>
      <Link
        href="/privacy-policy"
        className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Privacy
      </Link>
      <span aria-hidden="true">·</span>
      <Link
        href="/terms-of-service"
        className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Terms
      </Link>
    </footer>
  );
}
