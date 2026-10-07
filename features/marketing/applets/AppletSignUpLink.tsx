"use client";

// features/marketing/applets/AppletSignUpLink.tsx — "Sign up free" for someone who has not signed up.
// The gallery page is cached for everyone, so whether a person is signed in is read in the browser.

import Link from "next/link";

import { useSignedIn } from "@/lib/scoped-config/useSignedIn";

export function AppletSignUpLink({ href }: { href: string }) {
  if (useSignedIn()) return null;
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center rounded-md bg-primary px-4 type-title text-primary-foreground hover:bg-primary/90"
    >
      Sign up free
    </Link>
  );
}
