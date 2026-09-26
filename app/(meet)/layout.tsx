/**
 * app/(meet)/layout.tsx — the meeting route group (D12, register item MRI-D1).
 *
 * 🚨 **NO APP SHELL, NO NAV, NO GLOBAL SEARCH, NO MARKETING HEADER OR FOOTER.** A meeting is a
 * full-bleed stage. Every pixel this layout does not spend on chrome is a pixel of somebody's
 * face, and a nav rail beside a video call is the thing every conferencing product removes first.
 *
 * WHY ITS OWN GROUP, WITH EVIDENCE (D12 asked the builder to decide this against the build-profile
 * config, 2026-09-08):
 *  - `(core)` renders `AppShell` for every route beneath it (`app/(core)/layout.tsx`) — sidebar,
 *    header, org switcher. Wrong for a stage, and wrong for a guest who has no account to switch.
 *  - bare `(public)` renders `PublicHeader` + `PublicFooter` + `CanvasSideSheet`
 *    (`app/(public)/layout.tsx`) AND — the part that actually breaks Meet — passes NO
 *    `initialReduxState`, so a signed-in person arrives as a guest in Redux: no user, no org, and
 *    therefore an inert `<MeetHost>` and an inert `<MessagingHost>`. A host with no org cannot
 *    mint a token or admit anybody.
 *  - So this group is the `(kiosk)` / `(portal)` shape — `<Providers>` and nothing else — with
 *    ONE deliberate difference from the kiosk: it DOES call `getServerAuth()` and seed
 *    `initialReduxState`, exactly like `(core)` does, because a signed-in participant must arrive
 *    with real identity while a guest must still be let through the door (D6).
 *
 * 🚨 **THE GROUP IS ABSENT FROM `PARKABLE_GROUPS` IN `next.config.js`, DELIBERATELY** — same
 * ruling as `(kiosk)` and `(portal)`. A durable meeting link is an identity that must resolve in
 * whatever build is deployed (R3); a link that 404s because the deployment sliced the route out is
 * a broken meeting. The satellite hosts still hand `/meet/*` back to the main origin through
 * `proxy.ts`'s `satelliteGate`, so aimatrx.com is where a meeting actually renders.
 *
 * 🚨 **REACHABLE WITHOUT A SESSION, BY DESIGN.** `utils/auth/protected-routes.ts` is a DENYLIST
 * and names no `/meet` family, so `proxy.ts` never bounces this route to `/login`. Verified
 * against both files, 2026-09-08. That absence IS the guest path — do not "fix" it.
 *
 * The layout adds no frame of its own: `<MeetingSurface>` and the package's `.mx-meet` root own
 * the whole viewport (`h-dvh`, never `h-screen`). A host frame either IS the chrome or has none.
 */

import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import { mapUserData } from "@/utils/userDataMapper";
import { getAdminStatus, type AdminLevel } from "@/utils/supabase/userSessionData";
import type { BaseReduxState } from "@/types/reduxTypes";
import { Providers } from "@/app/Providers";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export default async function MeetLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Request-scoped cached auth lookup — shared with the page below, so the
  // whole tree pays one identity resolve.
  const { user, authUnavailable } = await getServerAuth();

  // 🚨 AN AUTHORITY WE COULD NOT REACH IS NOT A GUEST.
  //
  // This is the one group where the distinction is easy to get backwards,
  // because a guest IS a first-class identity here (D6) — so falling through
  // to the guest branch looks harmless. It is not. The guest branch seeds
  // guest Redux state, and this layout's own header says what that costs a
  // signed-in person: `<MeetHost>` goes inert, and "a host with no org cannot
  // mint a token or admit anybody." The host would sit in their own meeting
  // unable to let anyone in, with nothing on screen saying why. That is the
  // silent failure this codebase does not allow.
  //
  // Holding costs real guests NOTHING: a guest has no token to verify, and
  // `getClaims()` reports that as an ANSWER (`error: null`), so this branch is
  // only ever the "we could not tell" case. The durable meeting link (R3) is
  // unaffected — it resolves; it just asks for one reload when the auth
  // authority is unreachable, instead of opening a meeting that cannot work.
  if (authUnavailable) {
    console.warn(
      "[(meet)/layout] identity could not be verified — holding the stage, NOT seeding a guest identity over a possible host.",
    );
    return (
      <Providers initialReduxState={{ user: mapUserData(null, undefined, false) }}>
        <div className="flex h-dvh items-center justify-center p-6 text-center text-sm text-muted-foreground">
          <span>We could not verify who you are on this request, so this meeting is
          not opening yet. You have not been signed out — reload in a moment.
          <ErrorAlchemyMenu /></span>
        </div>
      </Providers>
    );
  }

  let initialReduxState: BaseReduxState;

  if (user) {
    const supabase = await createClient();
    const [
      {
        data: { session },
      },
      adminStatus,
    ] = await Promise.all([
      supabase.auth.getSession(),
      getAdminStatus(supabase, user.id).catch((err) => {
        console.error("getAdminStatus failed, defaulting to non-admin:", err);
        return { isAdmin: false, level: null as AdminLevel | null };
      }),
    ]);
    initialReduxState = {
      user: mapUserData(
        user,
        session?.access_token,
        adminStatus.isAdmin,
        adminStatus.level,
      ),
    };
  } else {
    // A guest is a first-class identity, not a degraded user (D6). They get the
    // same provider tree with guest user data — which is what keeps
    // `<MeetHost>` inert for them, so the only Meet runtime a guest ever has is
    // the room-scoped one `<MeetingSurface>` mounts with their typed name.
    initialReduxState = { user: mapUserData(null, undefined, false) };
  }

  return <Providers initialReduxState={initialReduxState}>{children}</Providers>;
}
