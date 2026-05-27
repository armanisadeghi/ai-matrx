"use client";

import { useState } from "react";
import { Settings as SettingsIcon, ShieldCheck } from "lucide-react";
import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import { Button } from "@/components/ui/button";
import { SettingsShell } from "@/features/settings/components/SettingsShell";

export default function SettingsShellDemoPage() {
  const [open, setOpen] = useState(false);
  const [asAdmin, setAsAdmin] = useState(false);
  const isRealAdmin = useSelector(
    (s: RootState) =>
      (s as RootState & { user?: { isAdmin?: boolean } }).user?.isAdmin ??
      false,
  );

  return (
    <div className="min-h-dvh bg-background">
      <div className="max-w-2xl mx-auto py-16 px-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <SettingsIcon className="h-7 w-7" />
        </span>
        <h1 className="mt-4 text-2xl font-bold text-foreground">
          Settings shell
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Phase 4 demo — the real settings window, wired to the Phase 3
          registry. Desktop mounts as a draggable WindowPanel with tree sidebar
          + breadcrumb + tab host. Mobile mounts as an iOS push-nav drawer. Tabs
          are placeholders until Phase 5.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button onClick={() => setOpen(true)} size="lg" className="h-10">
            <SettingsIcon className="h-4 w-4" />
            Open settings
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setAsAdmin((a) => !a)}
            className="h-10 gap-1.5"
          >
            <ShieldCheck className="h-4 w-4" />
            {asAdmin ? "Admin view: ON" : "Admin view: OFF"}
          </Button>
        </div>

        <div className="mt-6 inline-flex items-center gap-2 rounded-md border border-border bg-card/50 px-3 py-2 text-xs text-muted-foreground">
          <span>Real admin?</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
            {String(isRealAdmin)}
          </code>
          <span className="text-muted-foreground/60">·</span>
          <span>Demo override:</span>
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-foreground">
            {String(asAdmin)}
          </code>
        </div>
      </div>

      <SettingsShell
        isOpen={open}
        onClose={() => setOpen(false)}
        initialTabId="appearance.theme"
        isAdmin={asAdmin || isRealAdmin}
      />
    </div>
  );
}
