"use client";

// features/applets-host/builder/UseAppletDialog.tsx — "Use it" asks WHO can open it before it acts.
//
// Using an Applet and putting it on the web are separate choices (audit9 B8): "Use it" used to open
// "Publish …? Anyone with the link can open it … without signing in" with only Cancel / Publish, so the
// only way to use your own Applet was to give it to the world. Now the default is My organization (row
// security: the access ladder's Organization level); Anyone with the link is the deliberate second choice.
// The consequence line names the audience and every table "Use it" creates, before anything happens.

import { useState } from "react";
import { SegmentedControl } from "@ai-matrx/design-system/controls";
import { Building2, Globe } from "lucide-react";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { APPLET_AUDIENCE_LABELS, APPLET_AUDIENCES, appletUseConsequence, type AppletAudience } from "@/features/applets/lib/applet-state";

const ICONS: Record<AppletAudience, typeof Globe> = { organization: Building2, web: Globe };

export function UseAppletDialog({
  open,
  onOpenChange,
  name,
  slug,
  tablesToMake,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  name: string;
  slug: string | null;
  tablesToMake: readonly string[];
  busy: boolean;
  onConfirm: (audience: AppletAudience) => void;
}) {
  const [audience, setAudience] = useState<AppletAudience>("organization");
  const { title, description } = appletUseConsequence({ name, slug, audience, tablesToMake });
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        // Every opening starts from the safe choice.
        if (!next) setAudience("organization");
      }}
      title={title}
      description={description}
      content={
        <div className="flex flex-col gap-1.5" data-applet-use-audience="">
          <span className="text-xs font-medium text-muted-foreground">Who can open it</span>
          <SegmentedControl
            aria-label="Who can open it"
            fill
            value={audience}
            onValueChange={setAudience}
            data={APPLET_AUDIENCES.map((value) => {
              const Icon = ICONS[value];
              return {
                value,
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Icon className="size-3.5" />
                    {APPLET_AUDIENCE_LABELS[value]}
                  </span>
                ),
              };
            })}
          />
        </div>
      }
      confirmLabel={audience === "web" ? "Use it and publish" : "Use it"}
      busy={busy}
      onConfirm={() => onConfirm(audience)}
    />
  );
}
