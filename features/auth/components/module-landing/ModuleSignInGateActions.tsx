"use client";

import Link from "next/link";
import { ArrowRight, LogIn } from "lucide-react";
import { useLoginHref } from "@/hooks/auth/useLoginHref";

export function ModuleSignInGateActions() {
  const loginHref = useLoginHref();
  const signupHref = useLoginHref("/sign-up");
  return (
    <div className="mt-6 flex w-full flex-col gap-2">
      <Link
        href={loginHref}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <LogIn className="h-4 w-4" />
        Sign in
      </Link>
      <Link
        href={signupHref}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        Create a free account
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
