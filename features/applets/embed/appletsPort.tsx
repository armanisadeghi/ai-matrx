"use client";

// features/applets/embed/appletsPort.tsx — APPLETS INSIDE A PAGE BUILT FROM TABLES (a Space's applet block).
//
// v7 APPS-ON-DATA item 3 (Arman's endgame, 2026-10-02): one custom start page per person, built on the
// applets system (Applets), nested applets, mixing their own data with platform features. records-ui's
// page holds an `applet` block; this is the host's half — which applets the person may place (every app
// she can see, the apps home's own read) and the Applet itself, drawn by the ONE Applet host.

import dynamic from "next/dynamic";
import { createClient } from "@/utils/supabase/client";

const AppletInPage = dynamic(() => import("./AppletInPage"), {
  loading: () => <p className="text-xs text-muted-foreground">Opening the Applet…</p>,
});

/** Every applet this person can see, newest first — the apps home's own read (RLS is the ceiling). */
async function listApplets(): Promise<ReadonlyArray<{ id: string; name: string }>> {
  const { data, error } = await createClient()
    .schema("app")
    .from("definition")
    .select("id, name")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((a) => ({ id: a.id as string, name: (a.name as string | null) || "Untitled Applet" }));
}

/** The records-ui host port (`RecordsUiHost.applets`). Spread into a host object. */
export const APPLETS_PORT = {
  applets: {
    list: listApplets,
    render: (appId: string) => <AppletInPage key={appId} appId={appId} />,
  },
};
