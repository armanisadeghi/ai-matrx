/**
 * ForbiddenSurface — the SERVER-side face of the access gate.
 *
 * Rendered by every `forbidden.tsx` boundary, i.e. whenever a Server Component
 * calls Next's `forbidden()` (see `requireAccess(..., { forbid: true })`). It
 * says the one thing we can actually prove — you're signed in and this page
 * isn't yours to open, or you're signed out — and hands over real doors. It
 * never claims a deletion, an absence, or a wrong link.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS DOESN'T NAME THE RECORD, AND WHY YOU SHOULDN'T TRY (2026-08-11)
 *
 * The obvious idea is to have `requireAccess` stash `{token, id}` somewhere
 * request-scoped right before it throws, and let this component read it back
 * and render the full `<AccessGate>` — kind, name, owner, "Request access".
 * It was built that way (a `React.cache()` holder) and it DOES NOT WORK, for a
 * structural reason rather than a fixable bug:
 *
 *   Next renders the `forbidden.tsx` fallback EAGERLY, as part of building the
 *   loader tree — BEFORE the page component runs and throws. Instrumented in
 *   the browser, the order is literally GET → GET → SET. Whatever the page
 *   sets, the fallback has already rendered without it.
 *
 * So no request-scoped channel of any kind (cache, ALS, module global) can
 * carry the target here; the write always loses the race, and a module global
 * would additionally risk naming one user's record to another. Do not
 * reintroduce it.
 *
 * THE PATTERN THAT WORKS: a route that wants the record-specific gate must not
 * call `forbidden()` at all — it renders `<AccessGate token id/>` itself and
 * returns it. `AccessGate` is a client component, so a Server Component can
 * return it directly; `app/(core)/lists/[id]/page.tsx` is the live example.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import "server-only";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export async function ForbiddenSurface() {
  const [{ isAuthenticated }, headerList] = await Promise.all([
    getServerAuth(),
    headers(),
  ]);
  // `proxy.ts` stamps the request path; it is the only way a boundary can know
  // where the user was trying to go.
  const pathname = headerList.get("x-pathname") || "/dashboard";

  return (
    <div className="flex h-full min-h-64 w-full items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold text-foreground">
              {isAuthenticated
                ? "You don't have access to this page"
                : "Sign in to open this page"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {isAuthenticated
                ? "Your account can't open it. If someone shared it with you, ask them to share it with this account."
                : "We can't tell you anything about it until we know who you are."}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {isAuthenticated ? null : (
            <Button asChild size="sm">
              <Link href={`/login?next=${encodeURIComponent(pathname)}`}>
                <LogIn className="mr-1.5 h-4 w-4" aria-hidden />
                Sign in
              </Link>
            </Button>
          )}
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard">
              <ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />
              Back to what you can see
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
