import { redirect } from "next/navigation";

import { HR_ORG_PARAM } from "@/features/hr/constants";
import { hrComplianceLawsHref } from "@/features/hr/routes";

/**
 * `/hr/compliance` — the section root.
 *
 * 🚨 THIS CLOSES A LIVE DEAD END. `features/hr/shared/hr-nav.ts` has rendered a
 * top-level "Compliance" item resolving to `/hr/compliance` since the nav shipped,
 * and no route existed behind it — it 404'd for every persona that could see it.
 * The section's first real surface is the law portal (D25), so the root opens it,
 * carrying `?org=` through the builder rather than re-assembling a URL by hand.
 *
 * When Compliance grows its own landing surface, this file is what that lane
 * replaces — the tab bar in `HrComplianceShell` is where a new destination is added.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const org = params[HR_ORG_PARAM];
  redirect(hrComplianceLawsHref(typeof org === "string" ? org : null));
}
