import Link from "next/link";
import { LinkIcon } from "lucide-react";

// The honest 404 for a short link that is invalid or has expired. One message
// for both cases on purpose — the route must not be an oracle for probing
// which tokens ever existed. Real 404 status via the segment not-found
// boundary; no record details, no auth hints.
export default function ShortLinkNotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-textured px-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <LinkIcon className="h-6 w-6 text-muted-foreground" aria-hidden />
        </div>
        <h1 className="text-lg font-semibold text-foreground">
          This link is invalid or has expired
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Short links only work for a limited time. If it came from a
          notification, you can find the same item by signing in.
        </p>
        <div className="mt-6">
          <Link
            href="/login"
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Sign in to AI Matrx
          </Link>
        </div>
      </div>
    </div>
  );
}
