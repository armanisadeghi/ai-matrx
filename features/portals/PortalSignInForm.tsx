"use client";

// The one interactive part of the sign-in panel: an email field and a button.
// Everything around it — the portal's title, the organization's name, the
// layout and its dimensions — is server-rendered by the page, so nothing on
// this screen moves after the first paint.
//
// 🚨 THE ANSWER IS THE SAME SENTENCE EITHER WAY, and it comes from the route,
// not from here, so the screen cannot drift from the endpoint's promise. There
// is deliberately no "we don't recognise that address" branch to write.

import { useState, type FormEvent } from "react";
import { Loader2, Mail } from "lucide-react";

import { Input } from "@ai-matrx/design-system";

import { Button } from "@/components/ui/button";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export function PortalSignInForm({ slug }: { slug: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [problem, setProblem] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;
    setState("sending");
    setProblem(null);
    try {
      const response = await fetch(`/api/portal/${encodeURIComponent(slug)}/sign-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; message?: string }
        | null;
      if (!response.ok) {
        // The route's own words. A failure never becomes a silent no-op and
        // never becomes a generic "something went wrong".
        setProblem(body?.message ?? "That did not go through. Try again in a moment.");
        setState("error");
        return;
      }
      setState("sent");
    } catch {
      setProblem("We could not reach the portal just now. Check your connection and try again.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium text-foreground">Check your email</p>
        <p className="mt-1 text-muted-foreground">
          If that address is on this portal, a sign-in link is on its way. The link is
          single-use and expires shortly.
        </p>
        <button
          type="button"
          className="mt-3 text-sm font-medium text-primary underline underline-offset-4"
          onClick={() => setState("idle")}
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <label htmlFor="portal-email" className="block text-sm font-medium text-foreground">
        Your email address
      </label>
      <Input
        id="portal-email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event: React.ChangeEvent<HTMLInputElement>) => setEmail(event.target.value)}
        placeholder="you@yourcompany.com"
        className="h-11 text-base"
        aria-describedby={problem ? "portal-email-problem" : undefined}
      />
      <Button type="submit" className="h-11 w-full text-base" disabled={state === "sending"}>
        {state === "sending" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending your link
          </>
        ) : (
          <>
            <Mail className="h-4 w-4" />
            Email me a sign-in link
          </>
        )}
      </Button>
      {problem ? (
        <p id="portal-email-problem" className="text-sm text-destructive">
          {problem}
          <ErrorAlchemyMenu error={problem} />
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          No password to remember — we email you a link that signs you in.
        </p>
      )}
    </form>
  );
}
