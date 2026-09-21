// app/api/q/[token]/remint/route.ts — "TEXT ME A NEW LINK."
//
// The second of the two actions an expired, withdrawn or superseded link
// offers. It needs no sign-in — a person whose link ran out is exactly the
// person who cannot sign in to fix it — and it does not wake the agent: aidream
// mints a new link against the SAME parked call, so nothing on the other end
// learns a link was re-sent.
//
// The session is still forwarded when there is one, for the same reason as the
// completion door: aidream decides everything about identity from its own
// validation of that token, and this lane's only job is to hand it over or hand
// over nothing.
//
// The rate limits — too soon, too many — live in the database and come back as
// sentences a person can act on. This file adds none of its own.

import { NextResponse } from "next/server";

import { remintActionRequest } from "@/features/action-requests/service";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const dynamic = "force-dynamic";

async function sessionAccessToken(): Promise<string | null> {
  const { isAuthenticated } = await getServerAuth();
  if (!isAuthenticated) return null;
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  try {
    const answer = await remintActionRequest(token, await sessionAccessToken());
    return NextResponse.json({ state: answer.state, message: answer.message });
  } catch (thrown) {
    console.error("[/api/q/remint] re-mint failed", thrown as Error);
    return NextResponse.json(
      {
        state: "unavailable",
        message:
          "That did not reach us. Nothing was sent, so it is safe to try again in a moment.",
      },
      { status: 502 },
    );
  }
}
