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
// 🚨 WHAT LANE INVITE-DELIVERY CHANGED, AND WHY (2026-09-21). This page used to
// do exactly one thing before anything else: if nobody was signed in, it
// redirected to sign-up. So a stranger — which is what an outside invitation is
// FOR — was asked to create an account on a platform they had never heard of,
// for a reason the page had not yet given them, by somebody it had not yet
// named. Every other honest invitation on the internet says what is on offer
// first. It now reads `public.table_share_peek` — anonymously, off the token
// alone — and SHOWS the offer: which table, whose organization, what they will
// be able to do, and who shared it. Signing in is then a step they take for a
// reason, not a toll gate.
//
// THE PAGE STILL DECIDES NOTHING. The peek grants nothing and writes nothing;
// `custom.table_share_outside_accept` is the only thing that writes a
// permission, and it matches the token against a pending, unexpired invitation
// addressed to THIS signed-in person. An UNKNOWN token gets one sentence and
// learns nothing, so a link can never be used to discover that something is
// there — but a link that IS real says WHICH way it is dead (withdrawn, used,
// run out, wrong address) and who to ask, because a person holding the token
// already holds the secret and a bare "this did not work" is a dead end.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock,
  Loader2,
  LogIn,
  Table2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { invitationSignUpHref } from "@/utils/auth/invitation-links";
import {
  acceptOutsideShare,
  peekTableShare,
  type TableSharePeek,
} from "@/features/sharing/outside/outsideShareService";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

type Opened = Awaited<ReturnType<typeof acceptOutsideShare>>;

export default function AcceptTableSharePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [working, setWorking] = useState(false);
  const [peek, setPeek] = useState<TableSharePeek | null>(null);
  const [peekError, setPeekError] = useState<string | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);

  const look = useCallback(async () => {
    setPeekError(null);
    try {
      setPeek(await peekTableShare(token));
    } catch (e) {
      // 🚨 A FAILED READ IS NOT A FACT. "We could not look" is not "this link is
      // dead" — saying the second would send somebody away from an invitation
      // that works.
      setPeek(null);
      setPeekError(e instanceof Error ? e.message : String(e));
    }
  }, [token]);

  useEffect(() => {
    void look();
  }, [look]);

  const open = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      const answer = await acceptOutsideShare(token);
      // 🚨 HER ORGANIZATION IS NOT MOVED (lane ACCESS-IS-PERSONAL, owner's law 2026-09-23:
      // "the permission is to the person, not the org … my active org has no impact on what I
      // can see"). This used to dispatch `setOrganization` to the OWNER'S organization, because
      // the table page mounted the store for whichever organization was picked and an outsider
      // has none to pick. The table page now asks the table which organization it lives in
      // (`custom.object_organization`), so the grant alone opens it and her own selection stays
      // exactly where she left it — which is what "yours is unchanged" on that page says.
      setOpened(answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // The store is the truth about why; re-read it so the page says which.
      void look();
    } finally {
      setWorking(false);
    }
  }, [token, look]);

  const signIn = useCallback(async () => {
    // Sign-up carries the destination and the TOKEN back here (never the
    // address), and the store still matches the token to the address they end
    // up signing in with, so nothing is decided by the detour.
    router.push(
      invitationSignUpHref(`/invitations/table/accept/${token}`, token),
    );
  }, [router, token]);

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

  /** What is on offer, drawn the same way in every state that has one. */
  const offer = (p: TableSharePeek) => (
    <dl className="mb-6 divide-y rounded-lg border text-left text-sm">
      <div className="flex gap-3 p-2.5">
        <dt className="w-28 flex-shrink-0 text-xs text-muted-foreground">Table</dt>
        <dd className="min-w-0 font-medium">{p.table}</dd>
      </div>
      <div className="flex gap-3 p-2.5">
        <dt className="w-28 flex-shrink-0 text-xs text-muted-foreground">
          Organization
        </dt>
        <dd className="min-w-0">{p.organization}</dd>
      </div>
      <div className="flex gap-3 p-2.5">
        {/* `means` is the store's own phrase for the level, and it already starts
            with the verb — "can read it", "can read and comment on it". Under a
            "You can" label it read "You can can read it" (guide re-walk,
            2026-09-23), so the label names the row and the sentence says it once. */}
        <dt className="w-28 flex-shrink-0 text-xs text-muted-foreground">Access</dt>
        <dd className="min-w-0">You {p.means}</dd>
      </div>
      <div className="flex gap-3 p-2.5">
        <dt className="w-28 flex-shrink-0 text-xs text-muted-foreground">
          Shared by
        </dt>
        <dd className="min-w-0">{p.inviter}</dd>
      </div>
      <div className="flex gap-3 p-2.5">
        <dt className="w-28 flex-shrink-0 text-xs text-muted-foreground">Sent to</dt>
        <dd className="min-w-0">{p.invited_email}</dd>
      </div>
    </dl>
  );

  if (opened) {
    return shell(
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">{opened.table} is open to you</h2>
        <p className="mb-6 text-sm text-muted-foreground">{opened.say}</p>
        {/* THE LINK NAMES THE ORGANIZATION IT IS ABOUT (lane HUB-FIX), the way
            `platform.link_carries_its_organization` makes every notification link
            name its own. The table route no longer needs it — the table names its
            own organization (lane ACCESS-IS-PERSONAL) — but a link that says whose
            it is stays honest when copied. */}
        <Button
          onClick={() =>
            router.push(`/data-v2/${opened.table_id}?org=${opened.organization_id}`)
          }
        >
          Open {opened.table}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>,
    );
  }

  if (peekError) {
    return shell(
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <AlertCircle className="h-6 w-6 text-destructive" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">
          We could not check this invitation
          <ErrorAlchemyMenu />
        </h2>
        <p className="mb-2 text-sm text-muted-foreground">
          This does not mean the link is dead — we simply could not look. Try
          again, and if it keeps happening ask whoever sent it to resend it.
        </p>
        <p className="mb-6 break-words text-xs text-muted-foreground">{peekError} <ErrorAlchemyMenu error={peekError} /></p>
        <Button variant="outline" onClick={() => void look()}>
          Try again
        </Button>
      </div>,
    );
  }

  if (!peek) {
    return shell(
      <div
        className="flex items-center gap-2 text-sm text-muted-foreground"
        aria-busy="true"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Looking at what was shared with you…</span>
      </div>,
    );
  }

  // ── READY: they are signed in as the right person. ───────────────────────────
  if (peek.state === "ready") {
    return shell(
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Table2 className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">{peek.offer}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{peek.say}</p>
        {offer(peek)}
        {error ? (
          <p className="mb-4 text-sm text-destructive">{error} <ErrorAlchemyMenu error={error} /></p>
        ) : null}
        <Button onClick={() => void open()} disabled={working}>
          {working ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          Open {peek.table}
        </Button>
      </div>,
    );
  }

  // ── SIGN IN NEEDED: say what it is FIRST, then ask. ──────────────────────────
  if (peek.state === "sign_in_needed") {
    return shell(
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Table2 className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">{peek.offer}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{peek.say}</p>
        {offer(peek)}
        <Button onClick={() => void signIn()}>
          <LogIn className="mr-2 h-4 w-4" />
          Sign in or create an account
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          You are not joining {peek.organization}. {peek.table} is all you will
          see, and {peek.inviter} can take it back at any time.
        </p>
      </div>,
    );
  }

  // ── WRONG ACCOUNT: an honest sentence and a way out, never a dead end. ───────
  if (peek.state === "wrong_account") {
    return shell(
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
          <LogIn className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">
          This was sent to a different address
        </h2>
        <p className="mb-4 text-sm text-muted-foreground">{peek.say}</p>
        {offer(peek)}
        <Button onClick={() => void signIn()}>
          <LogIn className="mr-2 h-4 w-4" />
          Sign in as {peek.invited_email}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">{peek.ask}</p>
      </div>,
    );
  }

  // ── ALREADY OPEN. ───────────────────────────────────────────────────────────
  if (peek.state === "accepted") {
    return shell(
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">{peek.table} is already yours to see</h2>
        <p className="mb-6 text-sm text-muted-foreground">{peek.say}</p>
        <Button
          onClick={() =>
            router.push(
              peek.organization_id
                ? `/data-v2/${peek.table_id}?org=${peek.organization_id}`
                : `/data-v2/${peek.table_id}`,
            )
          }
        >
          Open {peek.table}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>,
    );
  }

  // ── DEAD, AND IT SAYS WHICH. revoked · expired · lane_closed · unknown ───────
  const deadTitle =
    peek.state === "revoked"
      ? "This invitation was taken back"
      : peek.state === "expired"
        ? "This invitation has run out"
        : peek.state === "lane_closed"
          ? "This organization has closed its outside door"
          : "This link cannot be opened";

  return shell(
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        {peek.state === "expired" ? (
          <Clock className="h-6 w-6 text-muted-foreground" />
        ) : (
          <AlertCircle className="h-6 w-6 text-muted-foreground" />
        )}
      </div>
      <h2 className="mb-2 text-xl font-semibold">{deadTitle}</h2>
      <p className="mb-2 text-sm text-muted-foreground">{peek.say}</p>
      {/* Who to ask. A dead link with nobody to ask is the dead end this page
          exists to remove. */}
      <p className="mb-6 text-sm">{peek.ask}</p>
      <Button variant="outline" onClick={() => void look()}>
        Check again
      </Button>
    </div>,
  );
}
