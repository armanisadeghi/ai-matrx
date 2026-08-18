"use client";

/**
 * Cloud Browser — demo / visibility surface (WS-8).
 *
 * Live test bench for the Cloud Browser panel, share dialog, and timeline against
 * fixtures. Everything here works with no backend; real reads swap in at M1/M3.
 */

import React from "react";
import { Button } from "@/components/ui/button";
import { Cloud } from "lucide-react";
import { useOpenCloudBrowserWindow } from "@/features/overlays/openers/cloudBrowserWindow";
import { CloudBrowserWindow } from "@/features/cloud-browser/components/CloudBrowserWindow";
import { TelemetrySurface } from "@/features/cloud-browser/components/TelemetrySurface";
import { AuditTimeline } from "@/features/cloud-browser/components/AuditTimeline";
import { ShareControl } from "@/features/cloud-browser/components/ShareControl";
import { Walkthrough } from "@/features/cloud-browser/components/Walkthrough";
import { FIXTURE_PROGRESS, FIXTURE_TELEMETRY } from "@/features/cloud-browser/fixtures";

export default function CloudBrowserDemoPage() {
  const openPanel = useOpenCloudBrowserWindow();
  const [inline, setInline] = React.useState(false);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Cloud className="h-5 w-5" /> Cloud Browser
        </h1>
        <p className="text-sm text-muted-foreground">
          Written progress by default, screenshots on request, and a live takeover only while a
          person is driving. Fixture-backed — no backend needed.
        </p>
      </header>

      <section className="flex flex-wrap gap-2">
        <Button onClick={() => openPanel({ initialProfileId: "bp_personal_default" })}>
          Open the Cloud Browser panel
        </Button>
        <Button variant="outline" onClick={() => setInline((v) => !v)}>
          {inline ? "Hide" : "Show"} inline panel
        </Button>
      </section>

      {inline ? (
        <div className="rounded-lg border border-dashed border-border p-4">
          <p className="mb-2 text-xs text-muted-foreground">
            Rendered standalone (the WindowPanel joins the window manager wherever it mounts):
          </p>
          <CloudBrowserWindow onClose={() => setInline(false)} initialProfileId="bp_personal_default" />
        </div>
      ) : null}

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
            Usage &amp; resources (D-9)
          </div>
          <TelemetrySurface telemetry={FIXTURE_TELEMETRY} />
        </div>
        <div className="rounded-lg border border-border">
          <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
            Sharing (canonical access service)
          </div>
          <div className="p-3">
            <ShareControl profileId="bp_personal_default" profileName="My Cloud Browser" canShare />
          </div>
        </div>
        <div className="h-72 overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
            Activity timeline (read-only)
          </div>
          <AuditTimeline events={FIXTURE_PROGRESS} />
        </div>
        <div className="h-72 overflow-hidden rounded-lg border border-border">
          <div className="border-b border-border px-3 py-2 text-sm font-semibold text-foreground">
            Walkthrough
          </div>
          <Walkthrough />
        </div>
      </section>
    </div>
  );
}
