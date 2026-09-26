"use client";

// app/(link)/q/[token]/ActionRunner.tsx — WHAT THE PERSON DOES.
//
// ONE component, switching on `render.form`, and nothing in this file derives
// anything from `kind`. The render spec is aidream's — the title, the choices,
// the consequence sentence, the submit label and the footnote all arrive
// written. A second copy of that registry here would one day disagree with the
// first, and on a credential form the disagreement would let somebody in.
//
// MOBILE FIRST BECAUSE THIS IS A PHONE ACT. The link arrives as a text and is
// answered in a queue or a car park: `min-h-dvh` never `h-screen`, the safe-area
// inset at the foot, `matrx-touch-targets` on the page shell, and `text-base` on
// every field — the iOS zoom floor, and also just legible.
//
// THE CONFIRMATION IS SYNCHRONOUS AND UNMISTAKABLE. The completion answers with
// the server's own "Got it, I'm on it." and a sentence saying what happens
// next, and those two are what the screen shows. A spinner that resolves into
// the same form is how a person taps twice.
//
// A REFUSAL LEAVES THE FORM USABLE. A 409 is "the thing you are answering has
// moved, or that answer was not accepted" — the server's message and its remedy
// are printed above the controls, and the controls stay live so the remedy can
// be acted on.

import { useCallback, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { ActionRequestReady } from "@/features/action-requests/service";
import {
  ACTION_REQUEST_UNREACHED,
  ActionRequestAnswerForm,
  useActionRequestAnswer,
  type ActionRequestAnswer,
} from "@/features/action-requests/components/ActionRequestAnswerForm";

// THE FORMS ARE THE SHARED PRIMITIVE. The chat card draws the same
// `ActionRequestAnswerForm`; this page only owns its door (the bearer
// capability in the URL) and its "you can close this page" ending.

export function ActionRunner({
  token,
  request,
}: {
  token: string;
  request: ActionRequestReady;
}) {
  const { busy, refusal, done, submit } = useActionRequestAnswer(
    async (answer: ActionRequestAnswer) => {
      const response = await fetch(`/api/q/${token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(answer),
      });
      return { status: response.status, body: await response.json().catch(() => null) };
    },
  );

  if (done) {
    return (
      <section className="flex flex-col justify-center py-10 text-center">
        {/* THE SERVER'S OWN CONFIRMATION — "Got it, I'm on it." */}
        <h1 className="text-xl font-medium">{done.message}</h1>
        {done.next ? (
          <p className="mt-3 text-sm text-muted-foreground">{done.next}</p>
        ) : null}
        <p className="mt-8 text-xs text-muted-foreground">You can close this page.</p>
      </section>
    );
  }

  return (
    <ActionRequestAnswerForm
      render={request.render}
      busy={busy}
      refusal={refusal}
      onSubmit={submit}
      layout="page"
    />
  );
}

/**
 * "Text me a new link." Posts to the re-mint door, which needs no sign-in and
 * does not wake the agent — the parked call is untouched, so nothing on the
 * other end learns a link was re-sent.
 */
export function TextMeANewLink({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const inFlight = useRef(false);

  const send = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetch(`/api/q/${token}/remint`, { method: "POST" });
      const body = (await response.json().catch(() => null)) as {
        message?: string | null;
      } | null;
      // EVERY OUTCOME IS A SENTENCE — sent, too soon, too many, already
      // answered, gone. The server writes all of them.
      setSaid(body?.message ?? ACTION_REQUEST_UNREACHED);
    } catch {
      setSaid(ACTION_REQUEST_UNREACHED);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [token]);

  if (said) return <p className="text-sm text-muted-foreground">{said}</p>;

  return (
    <Button className="w-full" disabled={busy} onClick={() => void send()}>
      {busy ? "Sending…" : "Text me a new link"}
    </Button>
  );
}
