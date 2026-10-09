"use client";

// features/applets-host/AppletDataRefusedNotice.tsx — WHY AN APPLET'S DATA IS NOT SHOWING.
//
// `@ai-matrx/applets` announces a refused READ (`announceRefusal(error, "read(<source>)")`). Before, the
// Applet's own empty state spoke instead ("0 books · No books found" to a signed-out visitor while the owner
// had a book — UI audit 2026-10-09). The host now says why, once, above the Applet: a visitor is offered
// sign-in that returns to this page; a signed-in person is told plainly. Never a grant — whether the data is
// shared is the owner's choice, made in Manage → Sharing.

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";

import { loginHref } from "@/utils/auth/auth-destination";

export function AppletDataRefusedNotice({ viewer }: { viewer: "guest" | "member" }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const here = search ? `${pathname}?${search}` : pathname;
  return (
    <div role="status" className="mx-auto flex max-w-5xl items-center gap-2 px-4 py-2 text-sm text-muted-foreground">
      <Lock className="h-4 w-4 shrink-0" />
      {viewer === "guest" ? (
        <span>
          <Link href={loginHref(here)} className="text-primary underline-offset-2 hover:underline">
            Sign in
          </Link>{" "}
          to see this Applet&apos;s data.
        </span>
      ) : (
        <span>You don&apos;t have access to this Applet&apos;s data.</span>
      )}
    </div>
  );
}
