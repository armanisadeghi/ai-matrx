"use client";

// app/(core)/invitations/table/accept/[token]/page.tsx
//
// WHERE AN OUTSIDE PERSON'S LINK LANDS.
//
// A plumber shares the Jobs table with a customer; a lab shares an experiments
// table with a collaborator at another university. The person following this
// link has NO membership of that organization and never gets one — accepting
// writes a grant on that one table, and that grant is the only reason they can
// reach the organization's doors at all.
//
// 🚨 IT IS NOT `/invitations/organization/accept/[token]`, AND THAT IS THE
// POINT. That route calls `inv_accept`, which inserts an `iam.memberships` row
// whose container is the invitation's target — so accepting a table share there
// would have turned "see this one table" into a place in the organization.
// `public.inv_accept` now refuses a `custom_table` invitation by name and says
// this is the door, and `inv_for_me` no longer lists them.
//
// THE PAGE DECIDES NOTHING. `custom.table_share_outside_accept` matches the
// token against a pending, unexpired invitation addressed to THIS signed-in
// person, and answers ONE sentence for every way that can fail — unknown, used,
// expired, somebody else's — so a link can never be used to learn that anything
// is there.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Check, Loader2, Table2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { supabase } from "@/utils/supabase/client";
import { invitationSignUpHref } from "@/utils/auth/invitation-links";
import { acceptOutsideShare } from "@/features/sharing/outside/outsideShareService";

type Opened = Awaited<ReturnType<typeof acceptOutsideShare>>;

export default function AcceptTableSharePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [working, setWorking] = useState(false);
  const [checking, setChecking] = useState(true);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        // The person on the other end of this link usually has NO account yet —
        // that is what "outside the organization" means. Sign-up carries the
        // destination and the TOKEN back here (never the address), and the
        // store still matches the token to the address they end up signing in
        // with, so nothing is decided by the detour.
        router.push(invitationSignUpHref(`/invitations/table/accept/${token}`, token));
        return;
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, token]);

  const open = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      setOpened(await acceptOutsideShare(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
    }
  }, [token]);

  const header = (
    <PageHeader>
      <HeaderStructured title="Shared with you" />
    </PageHeader>
  );

  const shell = (children: React.ReactNode) => (
    <>
      {header}
      <div className="flex h-full items-center justify-center overflow-y-auto bg-textured p-4 pt-[calc(var(--shell-header-h)+1rem)]">
        <Card className="w-full max-w-lg p-6">{children}</Card>
      </div>
    </>
  );

  if (checking) {
    return shell(
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Checking who you are signed in as…</span>
      </div>,
    );
  }

  if (opened) {
    return shell(
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">{opened.table} is open to you</h2>
        <p className="mb-6 text-sm text-muted-foreground">{opened.say}</p>
        <Button onClick={() => router.push(`/data-v2/${opened.table_id}`)}>
          Open {opened.table}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>,
    );
  }

  return shell(
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        {error ? (
          <AlertCircle className="h-6 w-6 text-destructive" />
        ) : (
          <Table2 className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <h2 className="mb-2 text-xl font-semibold">
        {error ? "This link could not be opened" : "Somebody shared a table with you"}
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        {error ??
          "Open it and that one table is yours to see. You are not joining their organization, and nothing else of theirs is open to you."}
      </p>
      {error ? (
        <Button variant="outline" onClick={() => void open()} disabled={working}>
          {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Try again
        </Button>
      ) : (
        <Button onClick={() => void open()} disabled={working}>
          {working ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          Open the table
        </Button>
      )}
    </div>,
  );
}
