// The `(kiosk)` route group — routes 35 and 36 (SPEC-TIME §2.8, SPEC-UI-IA §5.6, L3-65).
//
// 🚨 NO APP SHELL, NO NAV, NO GLOBAL SEARCH, NO ASSIST STRIP, NO USER SESSION, NO AI, AND NO ROUTE
// TO ANY OTHER HR SURFACE. This is a wall tablet in a break room. Anything that can be navigated
// from here is a terminal into everybody's employment records, so the group's layout is the
// narrowest one in the app: providers, and the page.
//
// Modelled on `app/(public)/layout.tsx` — which wraps children in `<Providers>` WITHOUT calling
// `getServerAuth()` and without `AppShell` — with `PublicHeader`, `PublicFooter` and
// `CanvasSideSheet` stripped. `<Providers>` is still needed: it supplies the Redux store, the query
// client and the dialog/toast hosts that `@/lib/toast` and `confirm()` portal into, and a kiosk with
// no toast host silently swallows every message it tries to show.
//
// Auth: `proxy.ts` gates by matching route prefixes; `/kiosk` is not among them, so the group is
// reachable without a session — which is the point. The device secret plus the employee PIN are the
// two factors on this door (§1.2), and RLS admits the kiosk nowhere: the `SECURITY DEFINER`
// functions are the only way in.
//
// `PARKABLE_GROUPS` in `next.config.js` does not list `kiosk`, and it needs no entry to build —
// an unlisted group is simply never parked out of a profile build.

import React from "react";

import { Providers } from "@/app/Providers";

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
