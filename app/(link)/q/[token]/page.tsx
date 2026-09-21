// app/(link)/q/[token]/page.tsx — THE ONE THING YOUR AGENT NEEDS FROM YOU.
//
// `platform.action_request`: an agent parks its turn, the person it works for
// gets a text with a one-tap link, they answer here, and the turn resumes by
// itself. This page is the answering surface and nothing else.
//
// IT LIVES IN `(link)` FOR THAT GROUP'S OWN REASON. This is a link somebody was
// SENT, on a phone, probably while doing something else. Our marketing header
// around it would invite them to download a product they already pay for
// instead of answering the one question their own agent asked, and the app
// shell would be a workspace drawn around a single yes/no.
//
// SERVER-RENDERED, AND NOT AS A HABIT. Two things are resolved HERE and can be
// resolved nowhere else: whether there is a session, and — if there is — the
// raw access token that tells aidream WHO is answering. aidream reads the
// person from its own validated token and refuses to take a user id from a
// body, so forwarding that header is the entire difference between a signed-in
// completion and a bearer one.
//
// THE RENDER SPEC IS THE SERVER'S. `render` arrives whole, already computed by
// aidream's kind registry, and so does `can_complete` — the entire session
// decision, resolved against the kind's consequence class and the
// organization's own knob. Nothing on this page derives either from `kind`. A
// second copy of that registry in TypeScript would one day disagree with the
// first, and the disagreement would be a credential page that let somebody in.
//
// THERE IS NO 404 ON THIS ROUTE, AND THAT IS DELIBERATE. Unknown, expired,
// withdrawn and superseded all answer with ONE sentence, so a link cannot be
// used to learn that anything is there.

import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { openActionRequest } from "@/features/action-requests/service";
import { currentRequestLoginHref } from "@/utils/auth/server-login-href";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

import { ActionRunner, TextMeANewLink } from "./ActionRunner";

// A request is answered now, by whoever holds the link; its state moves and
// nothing about it is cacheable across people.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // THE TITLE NAMES NOTHING ABOUT THE REQUEST. A tab title and a link preview
  // are the two places a request's contents leak into somebody else's
  // screenshot or chat thread, and what an agent asked its owner is theirs.
  title: "Your agent needs you",
  robots: { index: false, follow: false },
};

/**
 * The raw Supabase access token, or `null`.
 *
 * `getServerAuth()` is the VALIDATED identity — it round-trips `getUser()`, so
 * a forged or expired cookie is not a person. `getSession()` is where the raw
 * JWT lives, and on its own it is only what the cookie claims. Reading both and
 * returning the token ONLY when the validated user exists is what makes this
 * safe: we never forward a string we have not checked is a real session, and we
 * never forward anything at all when there is none.
 */
async function sessionAccessToken(): Promise<string | null> {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return null;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export default async function ActionRequestPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const accessToken = await sessionAccessToken();
  const request = await openActionRequest(token, accessToken);

  // A RE-TAP AFTER SUCCESS. No actions at all: there is nothing left to do, and
  // a button here would invite somebody to undo an answer their agent already
  // acted on.
  if (request.state === "done") {
    return <OneSentence>{request.message}</OneSentence>;
  }

  // A SESSION BELONGING TO SOMEBODY ELSE. Refused by name. Offering "sign in"
  // here would be advice to do the thing they have already done.
  if (request.state === "wrong_person") {
    return <OneSentence>{request.message}</OneSentence>;
  }

  // UNKNOWN, EXPIRED, WITHDRAWN, SUPERSEDED — one sentence for all four, and
  // EXACTLY TWO actions, in this order. Arman's ruling, verbatim: "if it's
  // expired, the user just has to either login or request a new link. We show
  // both options on the failed page."
  if (request.state === "unavailable") {
    return (
      <OneSentence>
        {request.message}
        <div className="mt-8 flex flex-col gap-3">
          <TextMeANewLink token={token} />
          <SignInAction token={token} label="Sign in" />
        </div>
      </OneSentence>
    );
  }

  // READY, BUT NOT FROM THIS SEAT. The ask is named, the server's own reason is
  // printed, and there is ONE action. The form is ABSENT — never drawn and
  // greyed, which is a screen telling somebody they may do a thing and then
  // refusing them.
  if (!request.can_complete) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 pb-safe pt-8 text-center matrx-touch-targets">
        <h1 className="text-xl font-medium">{request.render.title}</h1>
        <p className="mt-3 text-sm text-muted-foreground">{request.sign_in_reason}</p>
        <div className="mt-8 flex flex-col gap-3">
          <SignInAction token={token} label="Sign in" />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 pb-safe pt-8 matrx-touch-targets">
      <ActionRunner token={token} request={request} />
    </main>
  );
}

/** The shape every closed answer takes: one centred sentence, nothing else. */
function OneSentence({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center px-5 pb-safe pt-8 text-center matrx-touch-targets">
      <div className="text-sm text-muted-foreground">{children}</div>
    </main>
  );
}

/**
 * Sign in, WITH THIS PAGE AS THE DESTINATION. Built through the login primitive
 * (`utils/auth/FEATURE.md`) and never as a hand-rolled `?next=` string: three
 * spellings of that param had grown in this codebase and only one was ever
 * read, so twenty-five links shipped dead.
 */
async function SignInAction({ token, label }: { token: string; label: string }) {
  const href = await currentRequestLoginHref(`/q/${token}`);
  return (
    <Button asChild variant="outline" className="w-full">
      <Link href={href}>{label}</Link>
    </Button>
  );
}
