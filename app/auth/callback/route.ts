// File: app/auth/callback/route.ts
// Official Supabase SSR pattern for PKCE auth code exchange.
// https://supabase.com/docs/guides/auth/server-side/nextjs
//
// Uses createClient() from server.ts which correctly reads and writes cookies
// via next/headers in Route Handlers (cookies().set() is allowed in Route Handlers,
// unlike Server Components where it throws).

import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { extractErrorMessage } from "@/utils/errors";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const timestamp = new Date().toISOString();

  try {
    const code = searchParams.get("code");

    const redirectToParam = searchParams.get("redirectTo");
    let redirectTo = redirectToParam
      ? decodeURIComponent(redirectToParam)
      : "/dashboard";

    if (
      redirectTo === "/" ||
      redirectTo === "/login" ||
      redirectTo === "/sign-up" ||
      redirectTo === ""
    ) {
      console.log(
        `[${timestamp}] Auth callback - Invalid redirectTo (${redirectTo}), using /dashboard`,
      );
      redirectTo = "/dashboard";
    }

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
        console.error(
          `[${timestamp}] Auth callback - Error exchanging code:`,
          error,
        );
        const loginUrl = `${origin}/login?error=${encodeURIComponent("Authentication failed. Please try again.")}`;
        return NextResponse.redirect(loginUrl);
      }

      console.log(
        `[${timestamp}] Auth callback - Successfully exchanged code for session, user: ${data.user?.email}`,
      );

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

      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      let baseUrl: string;
      if (isLocalEnv) {
        baseUrl = origin;
      } else if (forwardedHost) {
        baseUrl = `https://${forwardedHost}`;
      } else {
        baseUrl = origin;
      }

      const finalRedirectTo =
        redirectTo &&
        redirectTo !== "/" &&
        redirectTo !== "/login" &&
        redirectTo !== "/sign-up"
          ? redirectTo
          : "/dashboard";

      const finalRedirectUrl = `${baseUrl}${finalRedirectTo}`;
      console.log(
        `[${timestamp}] Auth callback - Final redirect URL: ${finalRedirectUrl}`,
      );
      return NextResponse.redirect(finalRedirectUrl);
    }

    console.log(
      `[${timestamp}] Auth callback - No code present, redirecting to login`,
    );
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("Invalid authentication callback")}`,
    );
  } catch (unexpectedError) {
    const errMsg = extractErrorMessage(unexpectedError);
    const errStack =
      unexpectedError instanceof Error ? unexpectedError.stack : "no stack";
    console.error(`[${timestamp}] Auth callback - UNEXPECTED ERROR: ${errMsg}`);
    console.error(`[${timestamp}] Auth callback - Stack: ${errStack}`);
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent("An unexpected error occurred. Please try again.")}`,
    );
  }
}
