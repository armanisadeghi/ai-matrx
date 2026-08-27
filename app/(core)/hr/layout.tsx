// app/(core)/hr/layout.tsx
//
// ONE employer resolution for the whole `/hr` tree.
//
// Without `<HrProvider>` every shell, nav item, page and panel would fire its own
// `hr_my_context` — and, worse, they could briefly DISAGREE about which employer
// they are showing. In a strictly single-employer module that is a data-integrity
// problem, not a performance one: two surfaces on one screen showing two
// employers' data is the compliance defect the whole module is built to prevent.
//
// This layout deliberately adds NO wrapper element. `HrShell` is `h-full` and its
// height chain runs all the way up to `.shell-main`; a plain `<div>` here would
// break that chain from a file nobody would think to look in. It also adds no
// vertical clipping — a route layout boundary must never amputate its children.
//
// `<HrProvider>` reads `?org=` through `useSearchParams`, so it sits behind a
// Suspense boundary with a real skeleton rather than a spinner.

import { Suspense, type ReactNode } from "react";

import { HrProvider } from "@/features/hr/shared/HrProvider";
import { HrLoading } from "@/features/hr/shared/HrStates";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/hr", {
  title: "Human Resources",
  description: "Manage people, time, payroll, compliance, and workforce operations.",
});

export default function HrLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<HrLoading variant="cards" rows={4} />}>
      <HrProvider>{children}</HrProvider>
    </Suspense>
  );
}
