"use client";

// features/spaces/workspace/LoadAccessState.tsx — the honest screen when the pages could not be read:
// signed out (sign in, back to here), no access, or a fault (try again). Never database text.

import { Button, EmptyState } from "@ai-matrx/design-system/controls";
import { FileWarning, Lock, LogIn } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { LoadAccess } from "../state/load-access";

import { ErrorNotice } from "@ai-matrx/design-system";
export function signInHref(pathname: string | null): string {
  return `/login?next=${encodeURIComponent(pathname || "/spaces")}`;
}

export function LoadAccessState({ access, onRetry }: { access: LoadAccess | "fault"; onRetry?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full items-center justify-center p-6">
      {access === "signed-out" ? (
        <EmptyState
          icon={<LogIn />}
          title="Sign in to open your pages"
          action={
            <Button asChild variant="primary">
              <Link href={signInHref(pathname)}>Sign in</Link>
            </Button>
          }
        />
      ) : access === "no-access" ? (
        <EmptyState icon={<Lock />} title="You don't have access to Spaces" action={onRetry ? <Button variant="outline" onClick={onRetry}>Try again</Button> : undefined} />
      ) : (
        <ErrorNotice title="We couldn't load your pages" actions={onRetry ? <Button variant="outline" onClick={onRetry}>Try again</Button> : undefined} />
      )}
    </div>
  );
}
