// app/(admin)/administration/users/usage/page.tsx — RETIRED (lane DRILL-PRESETS-RETIRE, THE FLIP).
//
// Usage by person is the built-in Saved view "Usage by person" of AI usage (/administration/usage);
// a person's usage (`?user=<id>`) is that view on that person (`f.person=<id>`). Every in-app link
// already writes the new address (features/admin/usage-drill/usageLinks.ts); this keeps old
// bookmarks working.

import { redirect } from "next/navigation";

import { usagePersonHref, usageViewHref } from "@/features/admin/usage-drill/usageLinks";

export default async function UsersUsagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = (await searchParams).user;
  redirect(typeof user === "string" && user ? usagePersonHref(user) : usageViewHref("usage_by_person"));
}
