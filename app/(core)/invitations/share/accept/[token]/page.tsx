"use client";

// app/(core)/invitations/share/accept/[token]/page.tsx
//
// WHERE AN EMAILED "SHARED WITH EVERYONE IN …" LINK LANDS (access ladder T-32).
//
// A host shared a meeting's recording, transcript and notes with everyone who
// was in it; this person was invited by email and has no account (or is not
// signed in). The page SHOWS the offer first — what, from whom, what they may
// do — off the token alone (`public.record_share_peek`, anonymous), and only
// then asks them to sign in. It decides nothing: `public.record_share_accept`
// is the only writer, and it matches the token to a pending, unexpired
// invitation addressed to THIS signed-in person. Sibling of
// `/invitations/table/accept/[token]`.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Check, Loader2, LogIn, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { invitationSignUpHref } from "@/utils/auth/invitation-links";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  acceptRecordShare,
  peekRecordShare,
  type RecordShareAccepted,
  type RecordSharePeek,
} from "@/features/sharing/audience/audienceShareService";

export default function AcceptRecordSharePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [peek, setPeek] = useState<RecordSharePeek | null>(null);
  const [peekError, setPeekError] = useState<string | null>(null);
  const [opened, setOpened] = useState<RecordShareAccepted | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const look = useCallback(async () => {
    setPeekError(null);
    try {
      setPeek(await peekRecordShare(token));
    } catch (e) {
      // A failed read is not a dead link — say we could not look.
      setPeek(null);
      setPeekError(e instanceof Error ? e.message : String(e));
    }
  }, [token]);

  useEffect(() => {
    void look();
  }, [look]);

  const open = async () => {
    setWorking(true);
    setError(null);
    try {
      setOpened(await acceptRecordShare(token));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      void look();
    } finally {
      setWorking(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <>
      <PageHeader>
        <HeaderStructured title="Shared with you" />
      </PageHeader>
      <div className="flex h-full items-center justify-center overflow-y-auto bg-textured p-4 pt-[calc(var(--shell-header-h)+1rem)]">
        <Card className="w-full max-w-lg p-6 text-center">{children}</Card>
      </div>
    </>
  );

  const offer = (p: RecordSharePeek) => (
    <dl className="mb-6 divide-y rounded-lg border text-left text-sm">
      {[
        ["What", p.what ? `${p.title} — ${p.what}` : p.title],
        ["Access", p.means ? `You ${p.means}` : null],
        ["Shared by", p.inviter],
        ["Organization", p.organization],
        ["Sent to", p.invited_email],
      ]
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="flex gap-3 p-2.5">
            <dt className="w-28 flex-shrink-0 text-xs text-muted-foreground">{k}</dt>
            <dd className="min-w-0">{v}</dd>
          </div>
        ))}
    </dl>
  );

  const openButton = (href: string | null | undefined, title: string | null | undefined) =>
    href ? (
      <Button iconEnd={<ArrowRight />} variant="primary" onClick={() => router.push(href)}>
        Open {title ?? "it"}
      </Button>
    ) : null;

  if (opened) {
    return shell(
      <>
        <Check className="mx-auto mb-4 h-8 w-8 text-primary" />
        <h2 className="mb-2 text-xl font-semibold">{opened.say}</h2>
        {openButton(opened.href, opened.title)}
      </>,
    );
  }

  if (peekError) {
    return shell(
      <>
        <AlertCircle className="mx-auto mb-4 h-8 w-8 text-destructive" />
        <h2 data-error-box className="mb-2 text-xl font-semibold">We could not check this link<ErrorAlchemyMenu /></h2>
        <p className="mb-4 text-sm text-muted-foreground">
          This does not mean it is dead — we could not look. Try again.{" "}
          <ErrorAlchemyMenu error={peekError} />
        </p>
        <Button variant="outline" onClick={() => void look()}>
          Try again
        </Button>
      </>,
    );
  }

  if (!peek) {
    return shell(
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground" aria-busy="true">
        <Loader2 className="h-4 w-4 animate-spin" /> Looking at what was shared with you…
      </div>,
    );
  }

  if (peek.state === "ready") {
    return shell(
      <>
        <Users className="mx-auto mb-4 h-8 w-8 text-primary" />
        <h2 className="mb-2 text-xl font-semibold">{peek.say}</h2>
        {offer(peek)}
        {error ? (
          <p className="mb-4 text-sm text-destructive">
            {error} <ErrorAlchemyMenu error={error} />
          </p>
        ) : null}
        <Button icon={working ? <Loader2 className="animate-spin" /> : <Check />} variant="primary" onClick={() => void open()} disabled={working}>
          Open {peek.title ?? "it"}
        </Button>
      </>,
    );
  }

  if (peek.state === "sign_in_needed" || peek.state === "wrong_account") {
    return shell(
      <>
        <LogIn className="mx-auto mb-4 h-8 w-8 text-primary" />
        <h2 className="mb-2 text-xl font-semibold">{peek.say}</h2>
        {offer(peek)}
        <Button icon={<LogIn />} variant="primary" onClick={() => router.push(invitationSignUpHref(`/invitations/share/accept/${token}`, token))}>
          {peek.state === "wrong_account" ? `Sign in as ${peek.invited_email}` : "Sign in or create an account"}
        </Button>
        <p className="mt-3 text-xs text-muted-foreground">
          Opening it does not put you in {peek.organization ?? "their organization"}.
        </p>
      </>,
    );
  }

  if (peek.state === "accepted") {
    return shell(
      <>
        <Check className="mx-auto mb-4 h-8 w-8 text-primary" />
        <h2 className="mb-4 text-xl font-semibold">{peek.say}</h2>
        {openButton(peek.href, peek.title)}
      </>,
    );
  }

  // revoked · expired · unknown — say which, and who to ask.
  return shell(
    <>
      <AlertCircle className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
      <h2 className="mb-2 text-xl font-semibold">{peek.say}</h2>
      <p className="mb-6 text-sm">{peek.ask}</p>
      <Button variant="outline" onClick={() => void look()}>
        Check again
      </Button>
    </>,
  );
}
