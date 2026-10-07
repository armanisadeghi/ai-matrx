"use client";

// features/applets/embed/AppletInPage.tsx — ONE APPLET DRAWN INSIDE A PAGE BUILT FROM TABLES (a Space's
// `applet` block, records-ui `RecordsUiHost.applets`). Loaded on demand by `appletsPort.tsx`, so the Applet
// host never rides a table page's own chunk. The Applet renders through the ONE host (`AppletHostMount`);
// it mounts `embedded`, so its own pages navigate in place inside the block and its writes stay live.

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { AppletHostMount } from "@/features/applets-host/AppletHostMount";

/** One Applet, in place: read by id under the viewer's session (row security decides). */
export default function AppletInPage({ appId }: { appId: string }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    void createClient()
      .schema("app")
      .from("definition")
      .select("slug")
      .eq("id", appId)
      .is("deleted_at", null)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setFailed(error.message);
        else if (!data) setFailed("This Applet has not been shared with you.");
        else setSlug(data.slug);
      });
    return () => {
      cancelled = true;
    };
  }, [appId]);
  if (failed) return <p className="text-xs text-muted-foreground">{failed}</p>;
  if (!slug) return <p className="text-xs text-muted-foreground">Opening the Applet…</p>;
  return (
    <div data-applet-in-page={appId} className="min-h-24">
      <AppletHostMount appletId={appId} slug={slug} embedded />
    </div>
  );
}
