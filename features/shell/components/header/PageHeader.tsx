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
}

export default function PageHeader({
  children,
  desktop,
  mobile,
}: PageHeaderProps) {
  return (
    <PageHeaderPortal desktop={desktop} mobile={mobile}>
      {children}
    </PageHeaderPortal>
  );
}
