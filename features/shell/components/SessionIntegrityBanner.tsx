"use client";

/**
 * SessionIntegrityBanner — the screen refuses to wear an identity it cannot use.
 *
 * THE VIOLATION THIS EXISTS FOR (production, 2026-09-01). A browser can hold
 * the same auth cookie chunk twice — once host-only, once at `.aimatrx.com` —
 * and send both. Server reads reassemble the copy the browser happens to put
 * first; when that is the empty one, EVERY server read answers anonymous while
 * the browser's own client still resolves a real session. Two verifiers hit
 * the result within hours: a shell showing ADMIN over "Mine 0" against 686
 * jobs, "requires an authenticated session" under a Retry that could only
 * fail, and a valid Create answered "Authentication required" on `manage`.
 *
 * Every one of those screens LIED — they described a data problem, or offered
 * an action, when the truth was that this browser's session cookies disagree
 * with each other. A screen is absent or honest; never dead, disabled-looking,
 * or wearing a false sentence.
 *
 * The cookie fault itself is fixed and self-healing in `@ai-matrx/data/next`
 * (the proxy expires the losing scope on the very next request). This banner
 * is the second, independent half: whatever the cause, when the client shell
 * holds an identity the server could not see, the app SAYS SO, in one place,
 * in words, with the one action that resolves it.
 *
 * NOT a fork of `AuthSessionWatcher`. That owns "identity trust is broken →
 * HARD-STOP the tab" (signed out, or the cookie now belongs to someone else).
 * This is the softer, strictly different condition — the server saw NOBODY
 * while this tab has somebody — where blocking the tab would be wrong: the
 * user's work is intact, one sign-in restores it, and the proxy may already
 * have healed the jar underneath them.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { CalloutBanner } from "@/components/official/CalloutBanner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/utils/supabase/client";
import { useLoginHref } from "@/hooks/auth/useLoginHref";

interface SessionIntegrityBannerProps {
  /**
   * What the SERVER resolved for the request that rendered this document.
   * `false` for a genuine guest, and `false` for a signed-in person whose
   * cookies the server could not read — the client half below tells them
   * apart.
   */
  serverAuthenticated: boolean;
  /**
   * The proxy saw the same auth cookie at two Domain scopes on this request
   * (`MiddlewareSession.splitCookieJar`). Authoritative: when this is true the
   * cause is named rather than inferred, and the response already healed it.
   */
  splitCookieJar: boolean;
}

export default function SessionIntegrityBanner({
  serverAuthenticated,
  splitCookieJar,
}: SessionIntegrityBannerProps) {
  const [clientHasSession, setClientHasSession] = useState(false);
  const loginHref = useLoginHref();
  const router = useRouter();

  useEffect(() => {
    // Only worth asking when the server came back empty — for a signed-in
    // server render there is no split to find.
    if (serverAuthenticated) {
      setClientHasSession(false);
      return;
    }
    let live = true;
    // getSession() re-reads the cookie store; no network round-trip.
    void supabase.auth.getSession().then(({ data }) => {
      if (live) setClientHasSession(Boolean(data.session?.user));
    });
    return () => {
      live = false;
    };
  }, [serverAuthenticated]);

  const split = !serverAuthenticated && clientHasSession;
  if (!split) return null;

  return (
    <div className="px-3 pt-3">
      <CalloutBanner
        tone="destructive"
        icon={ShieldAlert}
        title="This browser's session cookies are inconsistent — sign in again"
        description={
          splitCookieJar
            ? "This browser sent two different copies of the sign-in cookie, so the server could not tell who you are. Anything on this page that needs your account will look empty or refuse to save, no matter how many times you retry. We have cleared the stale copy; signing in again restores the page."
            : "This tab is signed in, but the server did not recognise the session on this request, so anything that needs your account will look empty or refuse to save. Signing in again restores the page."
        }
        actions={
          <Button size="sm" onClick={() => router.push(loginHref)}>
            Sign in again
          </Button>
        }
      />
    </div>
  );
}
