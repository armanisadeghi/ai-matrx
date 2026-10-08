"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@ai-matrx/design-system/controls";
import { loginHref } from "@/utils/auth/auth-destination";

/**
 * A signed-out visitor on a phone sees the same two things the public header gives them: the
 * brand (home) and Sign in, which returns them to this page. Desktop guests have the sidebar's.
 * CSS-only swap (`md:hidden`), so the server-rendered row never shifts.
 */
export function GuestPhoneBrand() {
  return (
    <Link href="/" aria-label="AI Matrx home" className="flex h-11 w-11 shrink-0 items-center justify-center md:hidden">
      <Image src="/matrx/matrx-icon.svg" width={20} height={20} alt="AI Matrx Logo" priority />
    </Link>
  );
}

export function GuestPhoneSignIn() {
  const pathname = usePathname();
  return (
    <span className="contents md:hidden">
      <Button variant="quiet" asChild>
        <Link href={loginHref(pathname)}>Sign in</Link>
      </Button>
    </span>
  );
}
