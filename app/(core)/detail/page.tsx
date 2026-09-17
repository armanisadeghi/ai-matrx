// app/(core)/detail/page.tsx
//
// `/detail` — the Detail primitive's front door and its feature-visibility
// surface: a real record of yours opened as a window, a docked panel and a
// page, with the deep link for each and the same record at phone width.
//
// 🚨 IT IS IN `(core)` ON PURPOSE (VERIFY-U-P1, D6). The surface used to exist
// only as `/demos/detail-primitive` under `(dev)`, which the `core` profile —
// the preview server's default and the main site's slice — does not compile,
// so the page the docs pointed at answered with a redirect to a host nobody
// could reach. `(core)` is served by every profile. The body is the same
// component the demos route renders; the profile mechanism is untouched.
//
// It is also why `/detail` is no longer a dead path: `/detail/<type>/<id>` is
// a record, and `/detail` is now the page that explains and exercises them.

import type { Metadata } from "next";

import { DetailShowcase } from "@/features/window-panels/detail/DetailShowcase";

export const metadata: Metadata = { title: "Record details" };

export default function DetailIndexPage() {
  return (
    <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">
      <DetailShowcase />
    </div>
  );
}
