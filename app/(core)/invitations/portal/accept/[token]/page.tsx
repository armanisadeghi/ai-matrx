"use client";

// app/(core)/invitations/portal/accept/[token]/page.tsx
//
// WHERE AN INVITED CLIENT'S LINK LANDS.
//
// A plumbing customer follows the link her plumber texted her, signs in or makes
// an account with that address, and from here on she sees her own jobs and her
// own invoices — nothing else of the business. She has no membership of that
// organization and never gets one.
//
// 🚨 WHAT CHANGED ON 2026-09-21 (lane PORTAL-BIND). This page did not exist,
// because the flow it belongs to could not finish. A portal invitation could
// only be followed through the server's own out-of-band magic-link route, and
// the browser-side self-bind — the honest arm that proves the arriving person by
// the address the platform's own auth holds — reached its decision and then died
// one call later, because the grant it called judged the CALLER at Admin on the
// record being shared, which an arriving outsider has never held. The portal is
// now a second target type on the ONE invitation primitive, and
// `custom.portal_invite_accept` is the ONE door: it decides once (the token
// proves an admin of that organization made the invitation) and then performs
// the bind and the grant as that authority, in one transaction.
//
// 🚨 IT IS NOT `/invitations/organization/accept/[token]`. That route calls
// `inv_accept`, which inserts an `iam.memberships` row whose container is the
// invitation's target — so accepting a portal invitation there would have turned
// "see your own jobs" into a place in the plumbing company.
// `iam.invitation_has_its_own_door` is the one list that keeps them apart, and
// `inv_accept` now refuses this kind by name with the door that does take it.
//
// THE PAGE DECIDES NOTHING. `public.portal_share_peek` grants nothing and writes
// nothing; it exists so a stranger is told WHAT is on offer, and by whom, before
// being asked to make an account. An UNKNOWN token gets one sentence and learns
// nothing — so a link cannot be used to discover that something is there — but a
// link that IS real says which way it is dead (withdrawn, used, run out, wrong
// address, portal closed) and who to ask.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Clock,
  Loader2,
  LogIn,
  Building2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { invitationSignUpHref } from "@/utils/auth/invitation-links";
import { useAppDispatch } from "@/lib/redux/hooks";
import { setOrganization } from "@/lib/redux/slices/appContextSlice";
import {
  acceptPortalShare,
  peekPortalShare,
  type PortalShareAccepted,
  type PortalSharePeek,
} from "@/features/portals/portalInviteService";

export default function AcceptPortalInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useAppDispatch();
  const token = params.token as string;

  const [working, setWorking] = useState(false);
  const [peek, setPeek] = useState<PortalSharePeek | null>(null);
  const [peekError, setPeekError] = useState<string | null>(null);
  const [opened, setOpened] = useState<PortalShareAccepted | null>(null);
  const [error, setError] = useState<string | null>(null);

  const look = useCallback(async () => {
    setPeekError(null);
    try {
      setPeek(await peekPortalShare(token));
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

  const portalHref = useCallback(
    (slug: string | null | undefined) => (slug ? `/portal/c/${encodeURIComponent(slug)}` : "/portal"),
    [],
  );

  const open = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      const answer = await acceptPortalShare(token);
      // 🚨 SHE IS IN NO ORGANIZATION, SO SHE CAN NEVER CHOOSE ONE — and every
      // record surface HOLDS a request that carries none. Lane INVITE-DELIVERY
      // measured that dead end on the table share and closed it the same way.
      // This is NOT the banned "default organization": that law forbids a
      // RESOLVER choosing an organization from a cookie, a preference or a
      // personal org. This is an explicit act by the person, on the organization
      // the invitation itself named, at the moment they accept it — the same
      // `appContext/setOrganization` a click in the picker dispatches. It
      // confers nothing: the grant is what lets her read, and the ladder still
      // answers every door.
      dispatch(setOrganization({ id: answer.organization_id, name: answer.organization ?? "" }));
      setOpened(answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // The store is the truth about why; re-read it so the page says which.
      void look();
    } finally {
      setWorking(false);
    }
  }, [token, look, dispatch]);

  const signIn = useCallback(() => {
    // Sign-up carries the destination and the TOKEN back here (never the
    // address), and the store still matches the token to the address they end up
    // signing in with, so nothing is decided by the detour.
    router.push(invitationSignUpHref(`/invitations/portal/accept/${token}`, token));
  }, [router, token]);

  const header = (
    <PageHeader>
      <HeaderStructured title="Your portal" />
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
  const offer = (p: PortalSharePeek) => (
    <dl className="mb-6 divide-y rounded-lg border text-left text-sm">
      <div className="flex gap-3 p-2.5">
        <dt className="w-28 flex-shrink-0 text-xs text-muted-foreground">Portal</dt>
        <dd className="min-w-0 font-medium">{p.portal}</dd>
      </div>
      <div className="flex gap-3 p-2.5">
        <dt className="w-28 flex-shrink-0 text-xs text-muted-foreground">Business</dt>
        <dd className="min-w-0">{p.organization}</dd>
      </div>
      <div className="flex gap-3 p-2.5">
        <dt className="w-28 flex-shrink-0 text-xs text-muted-foreground">You will see</dt>
        <dd className="min-w-0">{p.sees}</dd>
      </div>
      <div className="flex gap-3 p-2.5">
        <dt className="w-28 flex-shrink-0 text-xs text-muted-foreground">Invited by</dt>
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
        <h2 className="mb-2 text-xl font-semibold">{opened.portal} is open to you</h2>
        <p className="mb-6 text-sm text-muted-foreground">{opened.say}</p>
        <Button onClick={() => router.push(portalHref(opened.slug))}>
          Open {opened.portal}
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
        <h2 className="mb-2 text-xl font-semibold">We could not check this invitation</h2>
        <p className="mb-2 text-sm text-muted-foreground">
          This does not mean the link is dead — we simply could not look. Try again, and if it
          keeps happening ask whoever sent it to resend it.
        </p>
        <p className="mb-6 break-words text-xs text-muted-foreground">{peekError}</p>
        <Button variant="outline" onClick={() => void look()}>
          Try again
        </Button>
      </div>,
    );
  }

  if (!peek) {
    return shell(
      <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>Looking at what you were invited to…</span>
      </div>,
    );
  }

  // ── READY: signed in as the right person. ───────────────────────────────────
  if (peek.state === "ready") {
    return shell(
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">{peek.offer}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{peek.say}</p>
        {offer(peek)}
        {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
        <Button onClick={() => void open()} disabled={working}>
          {working ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-2 h-4 w-4" />
          )}
          Open {peek.portal}
        </Button>
      </div>,
    );
  }

  // ── SIGN IN NEEDED: say what it is FIRST, then ask. ─────────────────────────
  if (peek.state === "sign_in_needed") {
    return shell(
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">{peek.offer}</h2>
        <p className="mb-4 text-sm text-muted-foreground">{peek.say}</p>
        {offer(peek)}
        <Button onClick={signIn}>
          <LogIn className="mr-2 h-4 w-4" />
          Sign in or create an account
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          You are not joining {peek.organization}. You are their customer: {peek.sees} is all you
          will see, and they can take it back at any time.
        </p>
      </div>,
    );
  }

  // ── WRONG ACCOUNT: an honest sentence and a way out. ────────────────────────
  if (peek.state === "wrong_account") {
    return shell(
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
          <LogIn className="h-6 w-6 text-amber-600 dark:text-amber-400" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">This was sent to a different address</h2>
        <p className="mb-4 text-sm text-muted-foreground">{peek.say}</p>
        {offer(peek)}
        <Button onClick={signIn}>
          <LogIn className="mr-2 h-4 w-4" />
          Sign in as {peek.invited_email}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">{peek.ask}</p>
      </div>,
    );
  }

  // ── ALREADY OPEN. ──────────────────────────────────────────────────────────
  if (peek.state === "accepted") {
    return shell(
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">{peek.portal} is already yours to open</h2>
        <p className="mb-6 text-sm text-muted-foreground">{peek.say}</p>
        <Button onClick={() => router.push(portalHref(peek.slug))}>
          Open {peek.portal}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>,
    );
  }

  // ── DEAD, AND IT SAYS WHICH.
  // revoked · expired · portal_archived · portal_closed · lane_closed · unknown
  //
  // FIX-12: ARCHIVED IS NOT CLOSED, and this screen is the one place a client
  // reads the word. VERIFIER-12 archived a portal whose confirm had promised
  // "their invitation links will say this portal was archived and can be
  // restored", and the client's page said "This portal has been closed". The
  // store answers `portal_archived` in its own sentence now, and so does this.
  const deadTitle =
    peek.state === "revoked"
      ? "This invitation was taken back"
      : peek.state === "expired"
        ? "This invitation has run out"
        : peek.state === "portal_archived"
          ? "This portal has been archived"
          : peek.state === "portal_closed"
            ? "This portal has been closed"
            : peek.state === "lane_closed"
              ? "This business has closed its outside door"
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
