"use client";

/**
 * The `/notifications` page body — the canonical InboxWorkspace with its
 * organization filter in the address (`?org_filter=`, default All
 * organizations, never the active organization) and the opening view from
 * `?view=`. Changing the filter replaces the address of THIS page only.
 */

import { startTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InboxWorkspace, isInboxTab } from "./InboxWorkspace";

export const ORG_FILTER_PARAM = "org_filter";

export function InboxPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const orgFilter = params.get(ORG_FILTER_PARAM);
  const view = params.get("view");
  return (
    <InboxWorkspace
      mode="page"
      initialTab={isInboxTab(view) ? view : "inbox"}
      orgFilter={orgFilter}
      onOrgFilterChange={(next) => {
        const q = new URLSearchParams(params.toString());
        if (next) q.set(ORG_FILTER_PARAM, next);
        else q.delete(ORG_FILTER_PARAM);
        const qs = q.toString();
        startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
      }}
    />
  );
}
