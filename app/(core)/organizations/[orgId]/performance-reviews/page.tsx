// `/organizations/[orgId]/performance-reviews` opens the standard performance review for that
// organization. It used to render a browser-local editor; reviews now live in the HR module
// (`/hr/performance`), where they are stored, routed to the manager and acknowledged.

import { redirect } from "next/navigation";

import { hrPerformanceHref } from "@/features/hr/routes";

export default async function PerformanceReviewsPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = await params;
  // `orgId` is a slug or a uuid; HR's employer filter takes either.
  redirect(hrPerformanceHref(orgId));
}
