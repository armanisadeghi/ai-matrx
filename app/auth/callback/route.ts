// File: app/auth/callback/route.ts
// Official Supabase SSR pattern for PKCE auth code exchange.
// https://supabase.com/docs/guides/auth/server-side/nextjs
//
// Uses createClient() from server.ts which correctly reads and writes cookies
// via next/headers in Route Handlers (cookies().set() is allowed in Route Handlers,
// unlike Server Components where it throws).

import { after, NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import { parseCookieHeader } from "@ai-matrx/data/db";
import {
  AUTH_COOKIE_NAME,
  LEGACY_AUTH_COOKIE_NAME,
  supabaseNext,
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
 *
 * Written as raw appended `Set-Cookie` headers, NOT `response.cookies.set`:
 * `ResponseCookies` keeps one entry per cookie NAME, so a second set for the
 * other scope would silently replace the first and one scope's leftovers would
 * survive. Nothing may call `response.cookies.*` on this response afterwards —
 * that would re-parse these headers into the one-per-name map and undo the
 * dual-scope expiry.
 */
function clearAuthCookies(
  response: NextResponse,
  cookieNames: string[],
): void {
  const expired = "Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT";
  for (const name of cookieNames) {
    response.headers.append("Set-Cookie", `${name}=; ${expired}`);
    response.headers.append(
      "Set-Cookie",
      `${name}=; ${expired}; Domain=.aimatrx.com`,
    );
  }
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/"/g, "&quot;");
}

/**
 * THE STALE-TAB ANNIHILATOR. A failed exchange usually means the tab that
 * started sign-in is running a stale bundle or carrying poisoned state — and a
 * plain 307 back to /login re-enters the SAME stale document, so the loop
 * survives every deploy. Instead of a redirect, the failure returns this tiny
 * page, which (1) tells the browser to drop its cached copies of this origin
 * (`Clear-Site-Data: "cache"` — best-effort, honored by Chrome and modern
 * WebKit), and (2) performs a FULL-DOCUMENT `location.replace` to /login with
 * a cache-busting param, so the next attempt runs the current bundle. Only the
 * failing tab is touched — every healthy session everywhere is unaffected.
 */
function staleTabRefreshResponse(loginUrl: string): NextResponse {
  const busted = `${loginUrl}${loginUrl.includes("?") ? "&" : "?"}fresh=${Date.now()}`;
  const attrUrl = escapeHtmlAttr(busted);
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>Refreshing sign-in</title>` +
    `<meta http-equiv="refresh" content="0;url=${attrUrl}"></head>` +
    `<body><p>Refreshing sign-in…</p>` +
    `<p><a href="${attrUrl}">Continue to sign in</a></p>` +
    `<script>window.location.replace(${JSON.stringify(busted)});</script>` +
    `</body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Clear-Site-Data": '"cache"',
    },
  });
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
      // D22 residual fix: only follow x-forwarded-host when it passes the
      // host allowlist (prod host from NEXT_PUBLIC_SITE_URL, Vercel system
      // hosts, *.vercel.app previews). On mismatch safeForwardedHost screams
      // and we fall back to the request's own origin — never a spoofed host.
      // Computed BEFORE the exchange so every redirect out of this handler —
      // success and the already-signed-in failure path alike — lands on the
      // public host whose `.aimatrx.com` cookies the browser holds, never an
      // internal or deployment host `request.url` may carry behind the proxy.
      const forwardedHost = safeForwardedHost(
        request.headers.get("x-forwarded-host"),
      );
      const isLocalEnv = process.env.NODE_ENV === "development";
      const baseUrl =
        !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin;

      const [jar, requestHeaders] = await Promise.all([cookies(), headers()]);

      // 🚨 THE DUPLICATE-PRESERVING VIEW (@ai-matrx/data 0.8.0). `cookies()`
      // keys its jar by NAME, so two same-name auth cookies at two Domain
      // scopes have ALREADY collapsed to one — survivor = whichever the
      // browser sent last, a coin flip between the session and anonymous.
      // That is the split-jar outage class, and this door was the last one
      // still blind to it: the code exchange and the "already signed in"
      // `getUser()` recovery below both read the jar.
      //
      // We feed the RAW header through `cookieStore.getAll` rather than the
      // door's `cookieHeader` option on purpose: `cookieHeader` REPLACES the
      // host view outright, which would silently discard the verifier alias
      // below (the 2026-08-31 mobile-outage fix). The package reconciles
      // whatever `getAll` returns — duplicates included — so routing the raw
      // entries through our own view keeps BOTH repairs.
      const rawCookieEntries = parseCookieHeader(requestHeaders.get("cookie"));
      const requestCookieEntries: { name: string; value: string }[] =
        rawCookieEntries.length > 0 ? rawCookieEntries : jar.getAll();

      /** First NON-EMPTY value for a name — the same non-empty-wins rule the
       *  package's `authCookie.reconcile` applies, for our own lookups. */
      const cookieValue = (name: string): string =>
        requestCookieEntries.find(
          (cookie) => cookie.name === name && cookie.value.length > 0,
        )?.value ?? "";

      // THE CUTOVER-COMPAT SHIM — root cause of the 2026-08-31 mobile outage.
      // The auth-authority cutover renamed the cookie (`sb-matrx-auth` →
      // `sb-matrx-auth-v2`) mid-day, and the legacy rename migration covers the
      // session cookie and its `name.N` chunks but NOT `name-code-verifier`.
      // A client still running a pre-cutover document (a stale mobile tab whose
      // action POST Vercel routes to its matching older deployment) starts
      // OAuth writing the verifier under the OLD name; Google's redirect then
      // lands on the CURRENT deployment, which reads only the new name — so the
      // exchange dies client-side with zero server trace, forever, on every
      // retry. Accept a verifier under ANY historical `sb-*-code-verifier`
      // name by presenting it to the client under the current name.
      // An EMPTY verifier cookie is as broken as an absent one — supabase-js
      // fails the exchange client-side on it with the generic error and zero
      // server trace — so presence means a NON-EMPTY value, never `has()`.
      const currentVerifierValue = cookieValue(CODE_VERIFIER_COOKIE);
      const verifierUsable = currentVerifierValue.length > 0;
      const verifierAliasFrom = verifierUsable
        ? null
        : (requestCookieEntries
            .find(
              ({ name, value }) =>
                name !== CODE_VERIFIER_COOKIE &&
                name.startsWith("sb-") &&
                name.endsWith("-code-verifier") &&
                value.length > 0,
            )?.name ?? null);
      if (verifierAliasFrom) {
        console.log(
          `[${timestamp}] Auth callback - LOUD: verifier arrived under historical cookie name "${verifierAliasFrom}"; aliasing to "${CODE_VERIFIER_COOKIE}" for the exchange`,
        );
      }

      console.log(`[${timestamp}] Auth callback - Creating Supabase client...`);
      const supabase = supabaseNext.serverClient({
        cookieStore: {
          getAll: () =>
            requestCookieEntries
              // An empty current-name verifier must not shadow the aliased
              // historical one — drop it from the view entirely.
              .filter(
                (cookie) =>
                  !(
                    cookie.name === CODE_VERIFIER_COOKIE &&
                    cookie.value.length === 0
                  ),
              )
              .map((cookie) =>
                cookie.name === verifierAliasFrom
                  ? { name: CODE_VERIFIER_COOKIE, value: cookie.value }
                  : cookie,
              ),
          set: (name, value, options) => {
            try {
              (
                jar.set as (
                  name: string,
                  value: string,
                  options?: Record<string, unknown>,
                ) => void
              )(name, value, options);
            } catch {
              // Mirrors utils/supabase/server.ts: a swallowed write is only
              // legal outside Route Handlers; here set() succeeds, but the
              // adapter contract stays identical to the canonical client.
            }
          },
        },
        host: requestHeaders.get("host"),
      });
      console.log(
        `[${timestamp}] Auth callback - Client created, exchanging code...`,
      );
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      console.log(
        `[${timestamp}] Auth callback - Exchange complete, error: ${!!error}`,
      );

      if (error) {
        // Diagnose before reporting: which auth cookies actually arrived?
        // Names only — never log cookie values. Read from the raw header view,
        // not `cookies()`: a name listed TWICE here is the split jar itself,
        // and the collapsed jar is precisely what hides it.
        const authCookieNames = requestCookieEntries
          .map(({ name }) => name)
          .filter(isAuthCookieName);
        const verifierArrived = verifierUsable || verifierAliasFrom !== null;

        console.error(
          `[${timestamp}] Auth callback - LOUD: code exchange failed ` +
            `(code=${error.code ?? "none"}, status=${error.status ?? "none"}, ` +
            `verifierCookiePresent=${verifierArrived}, ` +
            `verifierAliasedFrom=${verifierAliasFrom ?? "none"}, ` +
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
          return NextResponse.redirect(`${baseUrl}${redirectTo}`);
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
              // The diagnostic rides in the visible error on purpose: cookie
              // NAMES only, never values. It is the one channel that reaches
              // us from any affected device without server-log access.
              error:
                "Sign-in could not complete because this browser did not return its sign-in security cookie. Stale sign-in cookies have been cleared — please try again. " +
                `(diagnostic: expected ${CODE_VERIFIER_COOKIE}; received ${
                  authCookieNames.length > 0
                    ? authCookieNames.slice(0, 6).join(", ")
                    : "no sign-in cookies at all"
                })`,
            },
          )}`;
          const response = staleTabRefreshResponse(loginUrl);
          // The heal is per NAME — a name that arrived twice (the split jar)
          // still needs exactly one dual-scope expiry pair.
          clearAuthCookies(response, [...new Set(authCookieNames)]);
          return response;
        }

        // The verifier WAS usable and the exchange still failed. Say which
        // failure, on screen — this branch was previously mute, and a mute
        // branch cost hours during the 2026-08-31 outage. Codes and lengths
        // only, never cookie values.
        const loginUrl = `${origin}${preserveAuthDestination(
          "/login",
          { redirectTo },
          {
            error:
              "Authentication failed. Please try again. " +
              `(diagnostic: exchange rejected — ${error.code ?? error.name ?? "unknown"}` +
              `${error.status ? ` status ${error.status}` : ""}` +
              `${verifierAliasFrom ? `; verifier via ${verifierAliasFrom}` : `; verifier length ${currentVerifierValue.length}`})`,
          },
        )}`;
        return staleTabRefreshResponse(loginUrl);
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
      if (verifierAliasFrom) {
        // The shim carried this login — say so, and retire the historical
        // verifier so the next flow writes and reads only the current name.
        // Domain scope matches how every aimatrx host writes auth cookies;
        // response.cookies (not raw headers) so it composes with the session
        // cookies Next merges onto this response.
        console.log(
          `[${timestamp}] Auth callback - LOUD: exchange succeeded via historical verifier cookie "${verifierAliasFrom}"; expiring it`,
        );
        response.cookies.set(verifierAliasFrom, "", {
          path: "/",
          maxAge: 0,
          domain: ".aimatrx.com",
        });
        // ...and its HOST-ONLY twin, which `response.cookies` cannot also
        // reach: ResponseCookies keeps one entry per NAME, so a second set for
        // the other scope would replace the first. Same class as the
        // 2026-09-01 split auth jar. Raw append is safe here only because
        // nothing reads `response.cookies` after this point.
        response.headers.append(
          "Set-Cookie",
          `${verifierAliasFrom}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure; SameSite=Lax`,
        );
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
