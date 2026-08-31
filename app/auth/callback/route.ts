// File: app/auth/callback/route.ts
// Official Supabase SSR pattern for PKCE auth code exchange.
// https://supabase.com/docs/guides/auth/server-side/nextjs
//
// Uses createClient() from server.ts which correctly reads and writes cookies
// via next/headers in Route Handlers (cookies().set() is allowed in Route Handlers,
// unlike Server Components where it throws).

import { after, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import {
  AUTH_COOKIE_NAME,
  LEGACY_AUTH_COOKIE_NAME,
} from "@/utils/supabase/authCookie";
import { extractErrorMessage } from "@/utils/errors";
import { safeForwardedHost } from "@/utils/auth/safe-redirect";
import {
  authDestinationOr,
  normalizeAuthDestination,
  preserveAuthDestination,
  readAuthDestination,
  withAuthDestination,
} from "@/utils/auth/auth-destination";
import {
  GUEST_OAUTH_FP_COOKIE,
  transferGuestDataAfterOAuth,
} from "@/lib/services/guest-oauth-transfer";
import { ACQUISITION_VISITOR_COOKIE } from "@/lib/product-analytics/user-acquisition";
import { linkAcquisitionToUser } from "@/lib/product-analytics/server/acquisition-persistence";

// The PKCE code-verifier cookie the login server action sets before sending
// the browser to the provider. When it does not come back with the callback,
// supabase-js fails the exchange CLIENT-SIDE (no /token request ever reaches
// Supabase) — the signature of a broken cookie jar: stale pre-cutover cookies
// under the legacy name, an evicted Set-Cookie on the login response, or a
// jar past the browser's per-domain cap. 2026-08-31 mobile outage: iPhones
// looped forever on a generic "Authentication failed" with zero server-side
// trace while desktop logins worked.
const CODE_VERIFIER_COOKIE = `${AUTH_COOKIE_NAME}-code-verifier`;

// Every cookie this app's auth has ever written starts with one of these
// (current + chunks `name.N`, verifier `name-code-verifier`, legacy twins).
const AUTH_COOKIE_PREFIXES = [AUTH_COOKIE_NAME, LEGACY_AUTH_COOKIE_NAME];

function isAuthCookieName(name: string): boolean {
  return AUTH_COOKIE_PREFIXES.some(
    (prefix) => name === prefix || name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}-`),
  );
}

/**
 * Self-heal a broken cookie jar: expire every auth cookie present on the
 * request, at BOTH scopes it could have been written under (host-only and the
 * apex-wide `.aimatrx.com` span) — a deletion only lands when its Domain
 * attribute matches the original write. The next sign-in attempt then starts
 * from a clean jar instead of looping on the same poisoned state.
 */
function clearAuthCookies(
  response: NextResponse,
  cookieNames: string[],
): void {
  for (const name of cookieNames) {
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
    response.cookies.set(name, "", {
      path: "/",
      maxAge: 0,
      domain: ".aimatrx.com",
    });
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const timestamp = new Date().toISOString();
  let redirectTo: string | null = null;

  try {
    const code = searchParams.get("code");

    const redirectToParam = searchParams.get("redirectTo");
    const type = searchParams.get("type");
    // Validate to a same-site relative path BEFORE it is concatenated into the
    // final redirect URL — an absolute / userinfo-trick value (e.g. "@evil.com")
    // would otherwise produce an off-site open redirect (`${baseUrl}@evil.com`).
    // A recovery link legitimately targets /reset-password — which the shared
    // validator refuses as a *final* destination (it is an auth page). So the
    // recovery default is applied here, where it is the correct next HOP, and
    // the user's real destination rides nested inside it as its own param.
    const decodedRedirectTo = redirectToParam
      ? decodeURIComponent(redirectToParam)
      : null;
    redirectTo =
      type === "recovery"
        ? withAuthDestination(
            "/reset-password",
            readAuthDestination(decodedRedirectTo) ??
              normalizeAuthDestination(decodedRedirectTo),
          )
        : authDestinationOr(
            decodedRedirectTo ? { redirectTo: decodedRedirectTo } : null,
          );

    console.log(
      `[${timestamp}] Auth callback - Code: ${code ? "present" : "missing"}, redirectTo: ${redirectTo}`,
    );
    console.log(
      `[${timestamp}] Auth callback - ENV check: URL=${!!process.env.NEXT_PUBLIC_SUPABASE_URL}, PUBLISHABLE_KEY=${!!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}`,
    );

    if (code) {
      console.log(`[${timestamp}] Auth callback - Creating Supabase client...`);
      const supabase = await createClient();
      console.log(
        `[${timestamp}] Auth callback - Client created, exchanging code...`,
      );
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      console.log(
        `[${timestamp}] Auth callback - Exchange complete, error: ${!!error}`,
      );

      if (error) {
        // Diagnose before reporting: which auth cookies actually arrived?
        // Names only — never log cookie values.
        const jar = await cookies();
        const authCookieNames = jar
          .getAll()
          .map(({ name }) => name)
          .filter(isAuthCookieName);
        const verifierArrived = jar.has(CODE_VERIFIER_COOKIE);

        console.error(
          `[${timestamp}] Auth callback - LOUD: code exchange failed ` +
            `(code=${error.code ?? "none"}, status=${error.status ?? "none"}, ` +
            `verifierCookiePresent=${verifierArrived}, ` +
            `authCookiesPresent=[${authCookieNames.join(", ")}], ` +
            `ua=${request.headers.get("user-agent") ?? "unknown"}):`,
          error,
        );

        // The browser may still hold a perfectly valid session (a re-used
        // callback link, a second tab racing the first). Sending that user to
        // /login with an error is a lie — they are signed in. Verify against
        // the auth server, never the cookie alone.
        const { data: existing } = await supabase.auth.getUser();
        if (existing.user) {
          console.log(
            `[${timestamp}] Auth callback - exchange failed but a valid session exists; continuing to destination`,
          );
          return NextResponse.redirect(`${origin}${redirectTo}`);
        }

        if (!verifierArrived) {
          // Client-side failure — supabase-js never called /token. The jar is
          // broken (stale pre-cutover cookies, an evicted verifier). Retrying
          // against the same jar loops forever, so heal it: expire every auth
          // cookie on this response and say honestly what happened.
          const loginUrl = `${origin}${preserveAuthDestination(
            "/login",
            { redirectTo },
            {
              error:
                "Sign-in could not complete because this browser did not return its sign-in security cookie. Stale sign-in cookies have been cleared — please try again.",
            },
          )}`;
          const response = NextResponse.redirect(loginUrl);
          clearAuthCookies(response, authCookieNames);
          return response;
        }

        const loginUrl = `${origin}${preserveAuthDestination("/login", { redirectTo }, { error: "Authentication failed. Please try again." })}`;
        return NextResponse.redirect(loginUrl);
      }

      console.log(
        `[${timestamp}] Auth callback - Successfully exchanged code for session${
          process.env.NODE_ENV === "development"
            ? `, user: ${data.user?.email}`
            : ""
        }`,
      );

      if (data.user && data.user.is_anonymous !== true) {
        const permanentUserId = data.user.id;
        const acquisitionVisitorId = (await cookies()).get(
          ACQUISITION_VISITOR_COOKIE,
        )?.value;
        if (
          acquisitionVisitorId &&
          /^[A-Za-z0-9]{16,200}$/.test(acquisitionVisitorId)
        ) {
          after(async () => {
            try {
              await linkAcquisitionToUser(
                acquisitionVisitorId,
                permanentUserId,
              );
            } catch (error) {
              console.error(
                `[${timestamp}] Auth callback - LOUD: OAuth succeeded but acquisition linking failed`,
                error,
              );
            }
          });
        }
      }

      // Apple-specific: Persist user's name on first sign-in.
      // Apple only sends the user's name on the very first authorization.
      if (data.user) {
        const provider = data.user.app_metadata?.provider;
        const userMeta = data.user.user_metadata;

        if (provider === "apple") {
          const fullName = userMeta?.full_name;
          const givenName = userMeta?.given_name || userMeta?.first_name;
          const familyName = userMeta?.family_name || userMeta?.last_name;

          if (fullName || givenName || familyName) {
            const nameToStore =
              fullName || `${givenName || ""} ${familyName || ""}`.trim();
            console.log(
              `[${timestamp}] Auth callback - Apple first sign-in, persisting name: ${nameToStore}`,
            );

            try {
              await supabase.auth.updateUser({
                data: {
                  full_name: nameToStore,
                  ...(givenName && { given_name: givenName }),
                  ...(familyName && { family_name: familyName }),
                },
              });
            } catch (nameError) {
              console.error(
                `[${timestamp}] Auth callback - Failed to persist Apple user name:`,
                nameError,
              );
            }
          }
        }
      }

      // D20: if the OAuth flow started with a guest fingerprint stashed by
      // the OAuth server actions, transfer the guest's data (files,
      // conversations, everything FK'd to the anon UUID) onto this account.
      // FAIL-OPEN: any failure logs loudly and the login proceeds untouched.
      let guestFpToClear = false;
      try {
        const jar = await cookies();
        const guestFp = jar.get(GUEST_OAUTH_FP_COOKIE)?.value;
        if (guestFp) {
          guestFpToClear = true;
          if (data.user && data.user.is_anonymous !== true) {
            const transfer = await transferGuestDataAfterOAuth(
              guestFp,
              data.user.id,
            );
            if (transfer.transferred) {
              console.log(
                `[${timestamp}] Auth callback - guest data transferred onto ${data.user.id}: ${transfer.totalRows} rows (anon ${transfer.anonUserId})`,
              );
            } else if (transfer.reason !== "no_guest") {
              console.error(
                `[${timestamp}] Auth callback - LOUD: guest transfer did not run (${transfer.reason}): ${transfer.message ?? ""}`,
              );
            }
          }
        }
      } catch (guestErr) {
        console.error(
          `[${timestamp}] Auth callback - LOUD: guest transfer threw — login proceeds, guest data stays orphaned:`,
          guestErr instanceof Error ? guestErr.message : String(guestErr),
        );
      }

      // D22 residual fix: only follow x-forwarded-host when it passes the
      // host allowlist (prod host from NEXT_PUBLIC_SITE_URL, Vercel system
      // hosts, *.vercel.app previews). On mismatch safeForwardedHost screams
      // and we fall back to the request's own origin — never a spoofed host.
      const forwardedHost = safeForwardedHost(
        request.headers.get("x-forwarded-host"),
      );
      const isLocalEnv = process.env.NODE_ENV === "development";

      let baseUrl: string;
      if (isLocalEnv) {
        baseUrl = origin;
      } else if (forwardedHost) {
        baseUrl = `https://${forwardedHost}`;
      } else {
        baseUrl = origin;
      }

      const finalRedirectTo = redirectTo;

      const finalRedirectUrl = `${baseUrl}${finalRedirectTo}`;
      console.log(
        `[${timestamp}] Auth callback - Final redirect URL: ${finalRedirectUrl}`,
      );
      const response = NextResponse.redirect(finalRedirectUrl);
      if (guestFpToClear) {
        // One-shot carrier: always clear after the callback consumed it.
        response.cookies.delete(GUEST_OAUTH_FP_COOKIE);
      }
      return response;
    }

    console.log(
      `[${timestamp}] Auth callback - No code present, redirecting to login`,
    );
    return NextResponse.redirect(
      `${origin}${preserveAuthDestination("/login", { redirectTo }, { error: "Invalid authentication callback" })}`,
    );
  } catch (unexpectedError) {
    const errMsg = extractErrorMessage(unexpectedError);
    const errStack =
      unexpectedError instanceof Error ? unexpectedError.stack : "no stack";
    console.error(`[${timestamp}] Auth callback - UNEXPECTED ERROR: ${errMsg}`);
    console.error(`[${timestamp}] Auth callback - Stack: ${errStack}`);
    return NextResponse.redirect(
      `${origin}${preserveAuthDestination(
        "/login",
        { redirectTo },
        { error: "An unexpected error occurred. Please try again." },
      )}`,
    );
  }
}
