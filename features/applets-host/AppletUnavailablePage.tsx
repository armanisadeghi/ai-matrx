// features/applets-host/AppletUnavailablePage.tsx — what a signed-out visitor sees at an Applet address
// that cannot run: archived ("no longer available") or naming nothing. Never a sign-in wall: an account
// would not bring either back (live audit 2026-10-09, A2).

import Link from "next/link";
import { AppWindow } from "lucide-react";
import { Button, EmptyState } from "@ai-matrx/design-system/controls";

export type AppletUnavailableReason = "archived" | "missing";

/** The words for each reason. Exported for tests. */
export const APPLET_UNAVAILABLE_COPY: Record<AppletUnavailableReason, { title: string; line: string }> = {
  archived: { title: "This Applet is no longer available.", line: "Its owner has taken it down." },
  missing: { title: "There is no Applet at this address.", line: "Check the link with whoever sent it." },
};

export function AppletUnavailablePage({ reason }: { reason: AppletUnavailableReason }) {
  const copy = APPLET_UNAVAILABLE_COPY[reason];
  return (
    <main className="flex min-h-dvh items-center justify-center bg-textured p-6">
      <EmptyState
        icon={<AppWindow />}
        title={copy.title}
        line={copy.line}
        action={
          <Button variant="outline" asChild>
            <Link href="/">Go to AI Matrx</Link>
          </Button>
        }
      />
    </main>
  );
}
