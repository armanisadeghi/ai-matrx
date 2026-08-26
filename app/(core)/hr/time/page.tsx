// Route 27 — `/hr/time` (SPEC-UI-IA §3.4). The Time & Attendance section root.
//
// It renders nothing: the section's landing surface is the approval grid, so this redirects to
// route 28. That is the spec's own wording — *"Redirect to /hr/time/timesheets"* — and it is why
// this file has no header, no shell and no data fetch of its own.
//
// 🚨 THE EMPLOYER CONTEXT MUST SURVIVE THE HOP. SPEC-UI-IA §1 resolves the active employer from
// `?org=` BEFORE the user's active-org selection, and HR is strictly single-employer — so a
// redirect that dropped the param would silently land somebody in a *different* employer's
// timesheets. Merging two employers' pay data is a compliance defect, not a cosmetic bug. The
// param is therefore rebuilt through the one URL builder (`hrTimesheetsHref`) rather than
// concatenated here; nobody hand-assembles an HR URL.
//
// Why this route existed as a 404 until now: it sits between three lane briefs — the clock, the
// timesheet and the period lanes each owned leaves under `/hr/time/*` and none owned the root —
// so `hrTimeHref()` had a builder and no destination. A door that leads nowhere is exactly what
// the no-dead-ends law forbids.

import { redirect } from "next/navigation";

import { hrTimesheetsHref } from "@/features/hr/routes";

export default async function HrTimeSectionRoot({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; period?: string }>;
}) {
  const { org, period } = await searchParams;
  redirect(hrTimesheetsHref(org, period));
}
