// app/(link)/x/sign/page.tsx — AN E-SIGNATURE REQUEST SENT TO SOMEONE WITH NO ACCOUNT.
//
// The link e-sign emails an outsider is `/x/sign#t=<secret>` (esign._notify_actionable). It lives
// in `(link)` for that group's reason — a link somebody SENT, opened by a person who has no account
// — so there is no marketing chrome, no app shell and never a sign-in wall: the secret plus a
// one-time code when the sender asked for one is the whole credential (SPEC-ESIGN §5.4; esign-parity
// CONTRACT §13 — the v2 signing page).
//
// NOTHING IS READ ON THE SERVER. The secret is in the URL FRAGMENT, which no browser sends to any
// server; the client reads it and posts it to aidream in a request body.

import type { Metadata } from "next";

import { OutsiderEntry } from "@/features/esign/signer/OutsiderEntry";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // THE TITLE NAMES NOTHING: a tab title and a link preview are where contents leak.
  title: "Sign a document",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function OutsiderSignPage() {
  return (
    <div className="h-dvh">
      <OutsiderEntry />
    </div>
  );
}
