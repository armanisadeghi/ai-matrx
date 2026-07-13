// app/layout.tsx
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { cookies } from "next/headers";
import { metadata } from "./config/metadata";
import { viewport } from "./config/viewport";
import { inter, montserrat, openSans, roboto } from "@/styles/themes/fonts";
import { SyncBootScript } from "@/lib/sync/components/SyncBootScript";
import { syncPolicies } from "@/lib/sync/registry";
import { ChunkRecoveryBootScript } from "@/components/errors/ChunkRecoveryBootScript";
import { NewVersionWatcher } from "@/components/errors/NewVersionWatcher";

export { metadata, viewport };

interface RootLayoutProps {
  children: React.ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  // Phase 3: server-read theme cookie so the very first HTML frame has the
  // correct class on <html>. Previously the inline `SyncBootScript` was the
  // only authority, which means the default CSS rendered for a beat before
  // the script toggled the class. With the cookie path in place:
  //   1. Server sets class/data-theme based on cookie (most returning users).
  //   2. SyncBootScript re-runs at head-parse time as fallback for cookie-
  //      absent users with localStorage populated, or to apply the
  //      `prefers-color-scheme` default for true first-visits.
  //   3. themePolicy's cookie-write side-effect (PR 3.B) keeps the cookie
  //      in lockstep with the Redux action on every toggle.
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("theme")?.value;
  const isDark = themeCookie === "dark";
  const dataTheme =
    themeCookie === "light" || themeCookie === "dark" ? themeCookie : undefined;

  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={cn(
        inter.variable,
        montserrat.variable,
        openSans.variable,
        roboto.variable,
        isDark && "dark",
      )}
      data-theme={dataTheme}
      suppressHydrationWarning
    >
      <head>
        {/* Pre-hydration chunk-error recovery. Must come BEFORE any chunked
                    script so we can catch ChunkLoadError from the very first
                    chunk fetch — at that moment React boundaries don't exist
                    yet, so this is the only hook available. After React boots,
                    global-error.tsx and ErrorBoundaryView take over. */}
        <ChunkRecoveryBootScript />
        {/* Prevent autofill/password manager interference */}
        <meta name="autofill-off" content="true" />
        <meta name="password-manager-off" content="true" />
        <meta name="format-detection" content="telephone=no" />
        <meta name="google" content="notranslate" />
        {/* Sync-engine pre-paint script — declarative, built from
                    each policy's `prePaint` descriptors. Owns `.dark` class
                    and `data-theme` on <html> before first paint when the
                    server-read cookie (see RootLayout above) is absent.
                    Replaces: the ad-hoc inline theme script + hardcoded
                    `className="dark"` that previously lived here. */}
        <SyncBootScript policies={syncPolicies} />
      </head>
      <body
        className={cn(
          "min-h-dvh bg-textured font-sans antialiased",
          "data-form-type-none data-autofill-off",
        )}
        data-lpignore="true"
        data-form-type="other"
      >
        {/* NO Suspense around {children} here. A root boundary puts EVERY page
            in a streamed hole: the shell flushes with status 200 before any
            page-level notFound()/redirect can run, turning every missing
            record into a soft-404 (D36). The boundary that used to sit here
            was a leftover from the removed PostHogProvider (useSearchParams).
            Routes that want streaming declare their own loading.tsx/Suspense
            BELOW their existence checks. */}
        {children}
        <Toaster />
        <Sonner />
        {/* Consent-based new-version prompt + post-boot stale-chunk guard.
                        Bakes THIS deployment's id in server-side so the client can
                        compare against /api/version. Never auto-refreshes. */}
        <NewVersionWatcher
          deploymentId={process.env.VERCEL_DEPLOYMENT_ID ?? null}
        />
        {/* Glass portal layer — lives outside all content stacking contexts.
                    NO position, NO z-index, NO transform, NO overflow, NO filter here — ever.
                    Children (dock, panels) are position:fixed themselves.
                    A stacking context on this wrapper would block their backdrop-filter in Chromium. */}
        <div id="glass-layer" />
      </body>
    </html>
  );
}
