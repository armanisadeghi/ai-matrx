import Image from "next/image";
import Link from "next/link";

/**
 * The one attribution row a shared-link page (`app/(link)/…`) may carry.
 *
 * A stranger who opened a link somebody sent gets the thing they were sent,
 * not the marketing site — but a page that takes their input still names who
 * runs it and where its privacy and terms live. One slim row, the way a
 * Typeform or Calendly page ends: who published it, "Made with AI Matrx",
 * and the two legal links. No Download, no Discover, no sign-up pitch.
 */
export function MadeWithAiMatrx({
  publisherName,
}: {
  /**
   * Who sent it: the organization that published the thing on this page
   * (e.g. `get_aga_public_data.publisher_name`). Omitted when unknown.
   */
  publisherName?: string | null;
} = {}) {
  const publisher = publisherName?.trim();
  return (
    <footer
      data-made-with
      className="flex w-full shrink-0 flex-wrap items-center justify-center gap-x-2 px-4 pb-safe text-xs text-muted-foreground"
    >
      {publisher && (
        <>
          <span className="inline-flex min-h-11 items-center px-2">
            Published by {publisher}
          </span>
        </>
      )}
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
      <Link
        href="/privacy-policy"
        className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Privacy
      </Link>
      <Link
        href="/terms-of-service"
        className="inline-flex min-h-11 items-center rounded-md px-2 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Terms
      </Link>
    </footer>
  );
}
