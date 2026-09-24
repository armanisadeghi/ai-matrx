// app/auth/verifying/page.tsx — WHERE "COULD NOT VERIFY" WAITS.
//
// A server render reached no verdict on who this is (`authUnavailable`) even
// after the door's own retry. That is not "signed out", so no screen may gate,
// bounce to /login, or say "no access" on it. `getSessionVerdict()` sends the
// request here instead (utils/supabase/sessionVerdict.ts).
//
// This page waits a moment and opens the page again ONCE, silently. Only if the
// page sends the person back here a second time does it say one plain sentence
// and offer Try again. It never claims the person was signed out.

import type { Metadata } from "next";

import { VerifyingHold } from "./VerifyingHold";

export const metadata: Metadata = {
  title: "One moment · AI Matrx",
  robots: { index: false, follow: false },
};

export default async function VerifyingPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { next } = await searchParams;
  return <VerifyingHold next={Array.isArray(next) ? next[0] : next} />;
}
