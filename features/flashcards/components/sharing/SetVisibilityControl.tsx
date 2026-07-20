"use client";

// features/flashcards/components/sharing/SetVisibilityControl.tsx
//
// Phase 1A (Flashcards Competitive Parity Push) — share visibility toggle for
// a flashcard set. `fc_set.visibility` is a 4-way enum
// (private/internal/link/public), not the boolean `is_public` the generic
// `shareable_resource_registry` sharing system (`features/sharing/`) expects —
// that registry is built for per-user/org grants layered on a boolean public
// flag, a different shape than this single owner-controlled enum. Per the
// plan this is a dedicated, bespoke control (reusing the sharing feature's
// visual language: Switch-style state + copy-link), not a registry entry.
//
// NOTE: "link"/"public" visibility currently governs RLS on the `fc_set`/
// `fc_card` rows themselves — it does not yet expose an unauthenticated `/p/`
// viewer route, so "Public" today means "any signed-in user with the link",
// not "anyone on the internet". Documented in FEATURE.md; a public
// unauthenticated viewer is a follow-up, not silently implied here.

import { useState } from "react";
import { Globe2, Link2, Lock, Building2, Check, Copy } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { fcService } from "../../data/fcService";
import type { FcSetRow } from "../../data/types";

type Visibility = FcSetRow["visibility"];

const OPTIONS: {
  value: Visibility;
  label: string;
  description: string;
  icon: typeof Lock;
}[] = [
  {
    value: "private",
    label: "Private",
    description: "Only you can open this set",
    icon: Lock,
  },
  {
    value: "internal",
    label: "Organization",
    description: "Anyone in your organization can open this set",
    icon: Building2,
  },
  {
    value: "link",
    label: "Anyone with the link",
    description: "Signed-in users with the link can open this set",
    icon: Link2,
  },
  {
    value: "public",
    label: "Public",
    description: "Any signed-in user can find and open this set",
    icon: Globe2,
  },
];

export function SetVisibilityControl({
  setId,
  visibility,
  onChange,
}: {
  setId: string;
  visibility: Visibility;
  onChange: (next: Visibility) => void;
}) {
  const [saving, setSaving] = useState(false);
  const current = OPTIONS.find((o) => o.value === visibility) ?? OPTIONS[0];
  const CurrentIcon = current.icon;

  const setVisibility = async (next: Visibility) => {
    if (next === visibility || saving) return;
    setSaving(true);
    const res = await fcService.updateSetVisibility(setId, next);
    setSaving(false);
    if (res.error || !res.data) {
      toast.error("Couldn't update sharing", { description: res.error ?? undefined });
      return;
    }
    onChange(res.data.visibility);
    toast.success(`Sharing set to "${OPTIONS.find((o) => o.value === next)?.label}"`);
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/education/flashcards/${setId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy the link", { description: url });
    }
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={saving} className="gap-1.5">
            <CurrentIcon className="h-3.5 w-3.5" />
            {current.label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {OPTIONS.map((o) => {
            const Icon = o.icon;
            return (
              <DropdownMenuItem
                key={o.value}
                onClick={() => void setVisibility(o.value)}
                className="flex items-start gap-2 py-2"
              >
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-sm">
                    {o.label}
                    {o.value === visibility ? (
                      <Check className="h-3.5 w-3.5 text-primary" />
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">{o.description}</p>
                </div>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>

      {visibility !== "private" ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void copyLink()}
          className={cn("gap-1.5 text-muted-foreground")}
        >
          <Copy className="h-3.5 w-3.5" />
          Copy link
        </Button>
      ) : null}
    </div>
  );
}
