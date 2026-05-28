"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";

const LucideFullDemo = dynamic(() => import("./_chunks/lucide-full-demo"), {
  ssr: false,
  loading: () => (
    <p className="text-xs text-muted-foreground py-6">Loading Lucide module…</p>
  ),
});

const AppletIconPickerDemo = dynamic(
  () => import("./_chunks/applet-icon-picker-demo"),
  {
    ssr: false,
    loading: () => (
      <p className="text-xs text-muted-foreground py-6">
        Loading applet IconPicker…
      </p>
    ),
  },
);

const AppletIconDialogDemo = dynamic(
  () => import("./_chunks/applet-icon-dialog-demo"),
  {
    ssr: false,
    loading: () => (
      <p className="text-xs text-muted-foreground py-6">
        Loading IconPickerDialog…
      </p>
    ),
  },
);

const OfficialIconInputDemo = dynamic(
  () => import("./_chunks/official-icon-input-demo"),
  {
    ssr: false,
    loading: () => (
      <p className="text-xs text-muted-foreground py-6">
        Loading IconInputWithValidation…
      </p>
    ),
  },
);

type DemoKey = "lucide" | "applet" | "dialog" | "official";

const ROWS: {
  key: DemoKey;
  label: string;
  hint: string;
}[] = [
  {
    key: "lucide",
    label: "Full Lucide browser",
    hint: "@/components/ui/icon-picker — after mount: click the outline button (icon + name, or “Choose Icon”) to open the searchable grid dialog.",
  },
  {
    key: "applet",
    label: "Applet IconPicker (curated)",
    hint: "@/components/ui/IconPicker — appIcon + submitIcon",
  },
  {
    key: "dialog",
    label: "Applet IconPickerDialog",
    hint: "features/applet/.../IconPickerDialog.tsx",
  },
  {
    key: "official",
    label: "IconInputWithValidation",
    hint: "@/components/official/IconInputWithValidation.dynamic (next/dynamic, no grid)",
  },
];

export function IconFinderDemoClient() {
  const [mounted, setMounted] = useState<Record<DemoKey, boolean>>({
    lucide: false,
    applet: false,
    dialog: false,
    official: false,
  });

  const toggle = useCallback((key: DemoKey) => {
    setMounted((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const unmountAll = useCallback(() => {
    setMounted({
      lucide: false,
      applet: false,
      dialog: false,
      official: false,
    });
  }, []);

  const anyMounted = Object.values(mounted).some(Boolean);

  return (
    <div className="min-h-dvh bg-textured">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <header className="space-y-2">
          <h1 className="text-lg font-semibold">Icon finder demos</h1>
          <p className="text-sm text-muted-foreground">
            Heavy icon modules are not in the main page bundle. Each block is a
            separate chunk loaded the first time you mount it (toggle on). Turn
            off to unmount.
          </p>
          <p className="text-xs font-mono text-muted-foreground">
            Route: /ssr/demos/icon-finder-demo
          </p>
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
            <p className="font-medium">
              Searchable discovery (full Lucide grid)
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Mount{" "}
              <span className="font-medium text-foreground">
                Full Lucide browser
              </span>{" "}
              below, then use the{" "}
              <span className="font-medium text-foreground">
                outline button
              </span>{" "}
              that shows the current icon and name (or “Choose Icon”). That
              opens a dialog with search + thousands of icons — not visible
              until you click it.
            </p>
          </div>
        </header>

        <section className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Load demos
          </p>
          <ul className="space-y-3">
            {ROWS.map(({ key, label, hint }) => (
              <li
                key={key}
                className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-3 last:border-0 last:pb-0"
              >
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {hint}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={mounted[key] ? "secondary" : "outline"}
                  size="sm"
                  className="shrink-0"
                  onClick={() => toggle(key)}
                >
                  {mounted[key] ? "Unmount" : "Mount & load chunk"}
                </Button>
              </li>
            ))}
          </ul>
          {anyMounted ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={unmountAll}
            >
              Unmount all
            </Button>
          ) : null}
        </section>

        <section className="space-y-6">
          {mounted.lucide ? <LucideFullDemo /> : null}
          {mounted.applet ? <AppletIconPickerDemo /> : null}
          {mounted.dialog ? <AppletIconDialogDemo /> : null}
          {mounted.official ? <OfficialIconInputDemo /> : null}
        </section>
      </div>
    </div>
  );
}
