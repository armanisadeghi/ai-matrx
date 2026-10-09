"use client";

// features/applets/components/AppletWebDataNotice.tsx — the one line Manage shows when an Applet is on the
// web but a web visitor cannot read its data (custom tables and platform entities have no door for a
// signed-out reader). The fix is one click: make it organization-only. Sharing the data with visitors is
// not offered — no such door exists, and opening one is an access decision, not a button here.

import { useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { selectAppById } from "@/features/agents/redux/applets/selectors";
import { setAppletAudience } from "@/features/agents/redux/applets/thunks";
import { webVisitorsMissData } from "@/features/applets/lib/applet-state";
import { appletSources } from "@/features/applets/types";

export function AppletWebDataNotice({ appId }: { appId: string }) {
  const app = useAppSelector((state) => selectAppById(state, appId));
  const dispatch = useAppDispatch();
  const [busy, setBusy] = useState(false);
  if (!app || !webVisitorsMissData(app, appletSources(app))) return null;

  const takeOffWeb = async () => {
    setBusy(true);
    try {
      await dispatch(setAppletAudience({ appId, audience: "organization" })).unwrap();
      toast.success("Only your organization can open it.");
    } catch (error) {
      toast.error(error instanceof Error ? `Not changed: ${error.message}` : "Not changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
      <TriangleAlert className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate">On the web, but visitors can&apos;t see its data</span>
      <Button variant="outline" onClick={() => void takeOffWeb()} disabled={busy}>
        Make organization-only
      </Button>
    </div>
  );
}
