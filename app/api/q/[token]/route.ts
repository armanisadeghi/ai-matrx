// app/api/q/[token]/route.ts — WHERE AN ANSWER ARRIVES.
//
// A route handler and not a server action, deliberately: `/q/<token>` is an
// ADDRESS somebody was sent, and its write should be one too.
//
// THE ONE THING THIS FILE ADDS, and the whole reason the browser does not call
// aidream itself: the person's own Supabase access token, read from the session
// cookie server-side and forwarded as `Authorization: Bearer …`. aidream reads
// WHO is answering from its own validation of that token and refuses to take a
// user id from a body — there is no `viewer_user_id` field on any of these
// requests and there never may be. That header is the entire difference between
// a `signed_in_session` completion and a `link` one, and on a credential kind
// that difference is the gate.
//
// 🚨 WHEN THERE IS NO SESSION, NOTHING IS FORWARDED. A link tapped from a text
// arrives anonymous, and anonymous is a state aidream handles; a header built
// out of an absent session is not.
//
// IT DECIDES NOTHING ELSE. Expired, withdrawn, already answered, the wrong
// person, a credential kind whose organization has not switched on bearer
// completion, an origin that does not match the row, a field the agent did not
// ask for — every one of those is aidream's, and its sentences (and the remedy
// beside them) are carried back whole.

import { NextResponse } from "next/server";

import { completeActionRequest } from "@/features/action-requests/service";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const dynamic = "force-dynamic";

/** The validated person's raw token, or nothing. See the page for why both
 *  calls are needed: one validates, the other holds the string. */
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
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: {
    result?: Record<string, unknown> | null;
    field_values?: Record<string, string> | null;
    authenticator_secret?: string | null;
    origin?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { message: "That did not arrive as readable JSON, so nothing was recorded." },
      { status: 400 },
    );
  }

  try {
    const outcome = await completeActionRequest({
      token,
      accessToken: await sessionAccessToken(),
      result: body.result ?? null,
      fieldValues: body.field_values ?? null,
      authenticatorSecret: body.authenticator_secret ?? null,
      // THE ORIGIN IS THE SITE THE PAGE DISPLAYED, echoed back from the render
      // spec — NOT this app's own origin. aidream compares it to the origin
      // stored on the row (scheme, host and port, exactly) and saves nothing if
      // they differ; our own origin would never match and would refuse every
      // credential answer. An absent echo is the normal, accepted case.
      origin: body.origin ?? null,
    });

    if (outcome.outcome === "refused") {
      // 409 says "the thing you are answering has moved, or that answer was not
      // accepted" — not "you sent nonsense". The page keeps its form usable and
      // prints these two sentences above it.
      return NextResponse.json(
        {
          code: outcome.refusal.code,
          message: outcome.refusal.message,
          remedy: outcome.refusal.remedy,
        },
        { status: 409 },
      );
    }

    const answer = outcome.answer;
    return NextResponse.json({
      state: answer.state,
      message: answer.state === "ready" ? null : answer.message,
      next: answer.state === "done" ? (answer.next ?? null) : null,
    });
  } catch (thrown) {
    // NOTHING FAILS SILENTLY, and a server that could not be reached is not a
    // dead link: saying so would tell the person their link is wrong when it is
    // ours that is.
    const error = thrown as Error;
    console.error("[/api/q] completion failed", error);
    return NextResponse.json(
      {
        message:
          "That did not reach us. Nothing was recorded, so it is safe to try again in a moment.",
      },
      { status: 502 },
    );
  }
}
