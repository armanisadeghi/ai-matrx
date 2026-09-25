"use client";

import Link from "next/link";
import { useLayoutEffect } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { loginHref } from "@/utils/auth/auth-destination";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";

const HANDOFF_PATH = "/auth/desktop-handoff";

/** Remove every query value before this retired route renders its guidance. */
export function scrubDesktopHandoffUrl(): void {
  if (window.location.search || window.location.hash) {
    replaceAddressWithoutNavigating(HANDOFF_PATH);
  }
}

export default function DesktopHandoffPage() {
  useLayoutEffect(() => {
    scrubDesktopHandoffUrl();
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Sign in to AI Matrx</CardTitle>
          <CardDescription>
            This link cannot sign you in. Open AI Matrx and sign in with your normal browser session.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href={loginHref("/demos/local-tools")}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open sign in
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
