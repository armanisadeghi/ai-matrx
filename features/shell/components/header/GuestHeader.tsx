"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@ai-matrx/design-system/controls";
import { loginHref } from "@/utils/auth/auth-destination";

/**
 * A signed-out visitor sees the same two things the public header gives them, at every width: the
 * brand (home) and Sign in, which returns them to this page. Desktop guests had only the sidebar's
 * sign-in glyph, so a stranger on a module landing saw a top bar with neither (Applets audit G7).
 */
export function GuestBrand() {
  return (
    <Link href="/" aria-label="AI Matrx home" className="flex h-11 w-11 shrink-0 items-center justify-center">
      <Image src="/matrx/matrx-icon.svg" width={20} height={20} alt="AI Matrx Logo" priority />
    </Link>
  );
}

export function GuestSignIn() {
  const pathname = usePathname();
  return (
    <Button variant="quiet" asChild>
      <Link href={loginHref(pathname)}>Sign in</Link>
    </Button>
  );
}
