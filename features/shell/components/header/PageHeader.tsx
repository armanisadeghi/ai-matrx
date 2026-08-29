// PageHeader — Server Component shell for injecting content into the header center slot.
//
// Usage:
//   import { PageHeader } from "@/features/ssr-trials/components/PageHeader";
//
//   // All breakpoints — same content on mobile and desktop:
//   <PageHeader>
//     <MyServerComponent />
//   </PageHeader>
//
//   // Different content per breakpoint:
//   <PageHeader
//     desktop={<DesktopControls />}
//     mobile={<MobileTitle />}
//   />
//
// 🚨 THE PAGE BODY MUST RESERVE THE HEADER'S HEIGHT — `pt-[var(--shell-header-h)]` on the
// route's own body root (or `paddingTop: var(--shell-header-h)`). This is not styling.
// `.shell-main` is pulled up by `margin-top: calc(-1 * var(--shell-header-h))` so page
// content starts BEHIND the transparent header, and each route owns its own top offset
// (`app/(core)/_read_first_route_rules/docs/overview.md` §3). A page that skips it draws its
// own first row INSIDE the header band, where `.shell-header-inject` — this portal's
// wrapper, `width:100%` across the whole center zone with pointer-events enabled — sits on
// top of it. The row still renders, so nothing looks broken, and every click on it is
// swallowed by the header. That is how all three scope tabs on `/hr/tasks` and the
// "← All HR tasks" back link on the task detail page became visible and completely dead.
// `RouteHeader` (and every Hr*Shell built on it) reserves the offset for you; a bare
// `<PageHeader>` does NOT — the page still owes it.
//
// Rules enforced by .shell-header-inject CSS:
//   - The injection wrapper is always background:transparent, no border, no shadow.
//   - Children render their own glass via matrx-glass-thin-border — the container never does.
//   - Content must be self-contained; never pass in an element that carries a bg-* class
//     at the root level.
//
// Architecture:
//   This file has NO "use client" — it is a Server Component.
//   PageHeaderPortal (the only client boundary) handles useEffect + createPortal.
//   Children can be server-rendered nodes; React streams them through the portal.

import PageHeaderPortal from "./PageHeaderPortal";

interface PageHeaderProps {
  /** Shown on all breakpoints. Cannot be combined with desktop/mobile. */
  children?: React.ReactNode;
  /** Shown only on lg+ (desktop). Use with mobile prop. */
  desktop?: React.ReactNode;
  /** Shown only below lg (mobile). Use with desktop prop. */
  mobile?: React.ReactNode;
  /** Hidden whenever the same route tree mounts a page-specific header. */
  fallback?: boolean;
}

export default function PageHeader({
  children,
  desktop,
  mobile,
  fallback = false,
}: PageHeaderProps) {
  return (
    <PageHeaderPortal desktop={desktop} mobile={mobile} fallback={fallback}>
      {children}
    </PageHeaderPortal>
  );
}
