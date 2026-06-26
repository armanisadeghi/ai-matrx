"use client";

// ActiveOrgBootstrap — the live trigger for the active-organization bootstrap.
// Mounted once in the authenticated shell (AppShell). On mount it dispatches
// bootstrapActiveOrganization(), which loads the user's orgs, records the
// personal org (API fallback), and resolves the active org (default → only-org
// → nudge), then marks the bootstrap resolved so the "no org" cues
// (UserMenuTrigger red ring + HeaderOrgReminder peek) can appear.
//
// Renders nothing. Idempotent across remounts via a module-scoped guard — the
// shell is a singleton per session, but route-group transitions can remount it.

import { useEffect } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { bootstrapActiveOrganization } from "@/lib/redux/thunks/activeOrgBootstrap";

let started = false;

export default function ActiveOrgBootstrap() {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (started) return;
    started = true;
    void dispatch(bootstrapActiveOrganization());
  }, [dispatch]);

  return null;
}
