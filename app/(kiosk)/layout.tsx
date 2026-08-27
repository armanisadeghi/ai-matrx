/**
 * app/(kiosk)/layout.tsx — the kiosk route group (L3-65, SPEC-TIME §2.8, SPEC-UI-IA §5.6).
 *
 * 🚨 **NO APP SHELL, NO NAV, NO GLOBAL SEARCH, NO ASSIST STRIP, NO USER SESSION, NO AI, AND NO
 * ROUTE TO ANY OTHER HR SURFACE.** A wall tablet in a break room is a screen anyone can walk up to.
 * Every affordance this layout does not render is an affordance nobody can use to browse an
 * employer's HR data from the shop floor. That absence is the security property — `no-dead-ends`
 * names the kiosk as its one deliberate exception, and it must not be "fixed".
 *
 * WHAT IT DOES RENDER, AND WHY EXACTLY THIS MUCH
 * ----------------------------------------------
 * `app/(public)/layout.tsx` is the model: `<Providers>` around the children, **without**
 * `getServerAuth()` and **without** `AppShell`. `PublicHeader` / `PublicFooter` / `CanvasSideSheet`
 * are stripped — marketing chrome and a canvas front door have no business on a time clock. The
 * root `app/layout.tsx` still runs above this and supplies fonts, theme and the toaster.
 *
 * 🚨 **NO `getServerAuth()`, DELIBERATELY.** The kiosk has no user session by design: its actor is a
 * *device*, authenticated by a secret it paired with, and every call it makes is anon-callable with
 * the session token as the authorization. Resolving a user here would mean a tablet could carry
 * somebody's login — which is the buddy-punch hole the device identity exists to close. `proxy.ts`
 * gates only the families in `utils/auth/protected-routes.ts` (`/administration`, `/dashboard`,
 * `/chat`, `/launchpad`, `/scraper`); `/kiosk` is in none of them and is therefore ungated, which
 * is what this group requires. Verified against both files, 2026-08-27.
 *
 * The group is absent from `PARKABLE_GROUPS` in `next.config.js`, so it is never parked out of a
 * build profile and needs no registration — a kiosk must compile in whatever build the employer's
 * tablets point at. Verified 2026-08-27.
 *
 * 🚨 **THE LAYOUT ADDS NO FRAME OF ITS OWN, AND THAT IS DELIBERATE.** `KioskFrame` — which every
 * kiosk surface renders through — already sets `flex h-dvh flex-col overflow-hidden` on its root and
 * bounds a real `min-h-0 flex-1 overflow-y-auto` `<main>` inside it. An earlier version of this file
 * repeated that same frame here, which was two problems at once: it is the wrapper-around-a-component
 * the UI standards forbid (*a host frame either IS the chrome or has none*), and the outer
 * `overflow-hidden` clipped with no scroll owner of its own, which `pnpm check:scroll-chain` reports
 * because it cannot follow `{children}` through the route slot to the frame that does scroll. On a
 * tablet in landscape with the on-screen keyboard raised, a clipped PIN pad is one an hourly employee
 * cannot reach — so this is a real failure mode, not a lint nit. Providers, and the page. Nothing else.
 *
 * (`h-dvh` and never `h-screen` — `ios-mobile-first`: on an iPad the visual viewport is the only
 * honest measure, and `100vh` puts the primary control under the browser chrome. It lives on
 * `KioskFrame`, where the rest of the frame is.)
 */

import type { ReactNode } from "react";

import { Providers } from "@/app/Providers";

export default function KioskLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
