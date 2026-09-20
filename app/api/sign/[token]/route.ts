// app/api/sign/[token]/route.ts — WHERE A SIGNATURE ARRIVES.
//
// A route handler and not a server action, deliberately: a signing link is an
// ADDRESS somebody was sent, and its write should be one too.
//
// THE THREE THINGS THIS FILE ADDS that the browser could not be trusted to
// supply, and that are the whole reason the two store doors are server-lane:
//
//   · the ADDRESS the signature came from, read from the request's own headers.
//     A browser stating its own address on a certificate is a certificate that
//     lies.
//   · the BROWSER, read from `user-agent` for the same reason.
//   · the ORIGIN, read from the request rather than the body.
//
// It grants nothing and decides nothing else. Expired, withdrawn, already
// signed, already declined, a document that moved since the ask, what counts as
// a drawing and whether a name is blank are all the door's, and its sentences
// are carried back whole.

import { NextResponse } from "next/server";

import { declinePublicRequest, signPublicRequest } from "@/features/esign/service";

export const dynamic = "force-dynamic";

// A PNG data URL of a signature drawn at device resolution runs to a few hundred
// kilobytes. A megabyte is generous for that and refuses a body that is not one.
const MAX_IMAGE_CHARS = 1_000_000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let body: {
    action?: string;
    signedName?: string;
    mark?: string;
    image?: string | null;
    reason?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "That did not arrive as readable JSON, so nothing was recorded." },
      { status: 400 },
    );
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded && forwarded.length > 0 ? forwarded : null;
  const userAgent = request.headers.get("user-agent");

  try {
    if (body.action === "decline") {
      const outcome = await declinePublicRequest({
        token,
        reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null,
        ip,
        userAgent,
      });
      return NextResponse.json(
        {
          ok: outcome.declined === true,
          state: outcome.state ?? null,
          message: outcome.message,
        },
        { status: outcome.declined === true ? 200 : 409 },
      );
    }

    if (body.action !== "sign") {
      return NextResponse.json(
        { ok: false, message: "That is not something this page can do." },
        { status: 400 },
      );
    }

    const mark = body.mark === "drawn" ? "drawn" : "typed";
    const image = typeof body.image === "string" ? body.image : null;
    if (mark === "drawn" && image !== null && image.length > MAX_IMAGE_CHARS) {
      // SAID, NOT SWALLOWED. A too-large drawing is a thing the person can fix.
      return NextResponse.json(
        {
          ok: false,
          message:
            "That drawing is larger than this page accepts. Clear it and sign again with a simpler mark, or type your name instead.",
        },
        { status: 413 },
      );
    }

    const outcome = await signPublicRequest({
      token,
      signedName: typeof body.signedName === "string" ? body.signedName : "",
      mark,
      image: mark === "drawn" ? image : null,
      ip,
      userAgent,
      origin,
    });
    return NextResponse.json(
      {
        ok: outcome.signed === true,
        state: outcome.state ?? null,
        message: outcome.message,
      },
      // A request that was already answered, expired or invalidated is not an
      // error in the sender: 409 says "the thing you are answering has moved".
      { status: outcome.signed === true ? 200 : 409 },
    );
  } catch (thrown) {
    // THE STORE'S OWN WORDS. It says "Please type your name as you sign." and
    // "The drawing did not arrive. Please sign again." — which is what lets the
    // page point at what to fix instead of showing one generic failure.
    const error = thrown as Error & { hint?: string };
    return NextResponse.json({ ok: false, message: error.message }, { status: 400 });
  }
}
