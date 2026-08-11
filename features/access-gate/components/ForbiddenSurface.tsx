/**
 * ForbiddenSurface — the SERVER-side face of the access gate.
 *
 * Rendered by every `forbidden.tsx` boundary. When `requireAccess(...,
 * { forbid: true })` refused a specific record, this is the same
 * `<AccessGate>` the client surfaces render, so a server-refused route and a
 * client-refused route say the identical honest thing and offer the identical
 * "ask the owner" flow.
 *
 * When there is no target — a bare `forbidden()` from somewhere that never
 * named a record — we degrade to the one sentence we can actually prove
 * ("you're signed in, this page isn't yours to open") plus real doors. We do
 * NOT guess a reason, and we never say deleted, missing, or wrong-link.
 */
import "server-only";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft, Lock, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { getForbiddenTarget } from "@/lib/access/forbiddenTarget";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export async function ForbiddenSurface() {
  const target = getForbiddenTarget();

  if (target) {
    // The real thing: the platform resolves which of the four states this is,
    // names the record, and offers Request access.
    return (
      <AccessGate
        token={target.token}
        id={target.id}
        fallbackHref={target.fallbackHref}
        fallbackLabel={target.fallbackLabel}
      />
    );
  }

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
