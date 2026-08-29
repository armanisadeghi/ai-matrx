/**
 * app/(portal)/layout.tsx — the departed-member portal route group
 * (platform primitive `continued-access`, ruled by Arman 2026-08-29).
 *
 * 🚨 **NO APP SHELL, NO ORG SWITCHER, NO GLOBAL NAV, NO GLOBAL SEARCH, AND NO ROUTE TO ANY
 * ORG-SCOPED SURFACE.** The person on the other side of this layout used to work somewhere and
 * does not any more. Their login survived; every one of their organization grants did not —
 * `iam.memberships.status` is now `departed`, which `iam.organization_member` excludes, so
 * `my_orgs()` no longer returns their former employer and every org-scoped read comes back
 * empty. Rendering the normal shell here would offer them a nav full of doors that all refuse:
 * an org switcher with nothing in it, a search that finds nothing, links to `/hr` that 403.
 * Every affordance this layout does not render is a dead end nobody has to walk into. That
 * absence is the design, and it must not be "fixed".
 *
 * WHAT IT DOES RENDER, AND WHY EXACTLY THIS MUCH
 * ----------------------------------------------
 * `app/(kiosk)/layout.tsx` is the model: `<Providers>` around the children, without `AppShell`.
 * The root `app/layout.tsx` still runs above this and supplies fonts, theme and the toaster.
 *
 * 🚨 **UNLIKE THE KIOSK, THIS GROUP HAS A REAL SIGNED-IN USER — DELIBERATELY.** The kiosk's actor
 * is a device and resolving a user there would be a hole. Here the opposite is true: the portal
 * exists precisely so a person can act AS THEMSELVES after leaving. Consent to disclose your own
 * income is the subject's and nobody else's (`hr_verification_consent` refuses everyone but the
 * subject, HR admins included), so an anonymous or token-only lane could never carry it. The
 * page resolves the caller through the normal session; `continued_access_portal` answers for
 * `auth.uid()` and takes no user id, so there is nothing here to point at anyone else.
 *
 * The group is absent from `PARKABLE_GROUPS` in `next.config.js` on purpose: a former employee
 * being asked for an income verification must be able to answer in whatever build is deployed.
 */

import type { ReactNode } from "react";

import { Providers } from "@/app/Providers";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
