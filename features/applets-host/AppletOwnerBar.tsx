// features/applets-host/AppletOwnerBar.tsx — the maker's way back from their running Applet.
//
// An Applet at /applets/<slug> is the whole screen with no product shell, so the person who just made one
// landed on a bare page with no door back to AI Matrx, to its settings or to changing it (live audit
// 2026-10-09, R4). Only its maker sees this bar; visitors and teammates see the Applet alone.

import Link from "next/link";
import { ArrowLeft, MessageSquare, Settings2 } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";

/** The bar's three doors, in order. Exported for tests. */
export function appletOwnerDoors(appletId: string): { label: string; href: string }[] {
  return [
    { label: "Back to AI Matrx", href: "/applets" },
    { label: "Manage", href: `/applets/manage/${appletId}` },
    { label: "Change with AI", href: `/applets/manage/${appletId}/code` },
  ];
}

const ICONS = [ArrowLeft, Settings2, MessageSquare] as const;

export function AppletOwnerBar({ appletId }: { appletId: string }) {
  return (
    <nav
      aria-label="Your Applet"
      title="Only you see this bar"
      data-testid="applet-owner-bar"
      className="flex items-center gap-1 border-b border-border bg-card px-3 py-1"
    >
      {appletOwnerDoors(appletId).map((door, i) => {
        const Icon = ICONS[i] ?? ArrowLeft;
        return (
          <Button key={door.href} variant="quiet" asChild icon={<Icon />}>
            <Link href={door.href}>{door.label}</Link>
          </Button>
        );
      })}
    </nav>
  );
}
