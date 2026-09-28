import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, KeyRound } from "lucide-react";

import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ApproveBrowserWorkspace } from "@/features/secrets/components/ApproveBrowserWorkspace";

/**
 * /vault/approve-browser?key=<thumbprint>&label=<browser> — approve one browser
 * for password filling with the account passkey (access ladder T-30c). Opened by
 * the AI Matrx extension's "Turn on filling" card.
 */
export default async function ApproveBrowserRoute({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(await searchParams)) {
      if (typeof v === "string") query.set(k, v);
    }
    const next = `/vault/approve-browser${query.size ? `?${query}` : ""}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <>
      <PageHeader>
        <div className="flex w-full items-center gap-1.5 px-1">
          <Link
            href="/vault"
            className="text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            Vault
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">
            Approve a browser
          </span>
        </div>
      </PageHeader>
      <Suspense>
        <ApproveBrowserWorkspace />
      </Suspense>
    </>
  );
}
