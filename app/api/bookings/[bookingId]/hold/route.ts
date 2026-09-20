// app/api/bookings/[bookingId]/hold/route.ts — WHERE A TIME IS TAKEN OFF THE BOARD.
//
// POST holds one slot. GET re-reads what is free, which is what the picker asks
// for after it loses a race — so the person's next choice is made against the
// board as it is now, not as it was when the page loaded.
//
// THE TWO THINGS THIS FILE ADDS, and they are the whole reason
// `custom.booking_hold` is server-lane:
//
//   · the ORIGIN, read from the request's own header. A browser stating its own
//     origin is not a check.
//   · the BUCKET — a coarse client identifier, the forwarded address the
//     platform gives us, falling back to the origin. For a form the bucket is
//     only a rate-limit budget; for a booking it is ALSO WHO IS HOLDING THE
//     SLOT, so a browser choosing it would be a browser able to confirm
//     somebody else's hold. `bucketFor` is the one definition, shared with the
//     confirm route, because a hold taken under one bucket and confirmed under
//     another is a person refused their own appointment.
//
// It decides nothing else. Whether the time is one this page offers, whether it
// is past the lead time or over the daily cap, the rate window, and the race
// itself are all the door's, and its sentences are carried back whole.

import { NextResponse } from "next/server";

import { bucketFor, holdSlot, publicBooking } from "@/features/booking/service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;
  const page = await publicBooking(bookingId).catch(() => null);
  if (!page) {
    return NextResponse.json({ ok: false, slots: [] }, { status: 404 });
  }
  return NextResponse.json({ ok: true, slots: page.slots, state: page.state });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;

  let body: { slotKey?: string; clientKey?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "That request did not arrive as readable JSON, so no time was held." },
      { status: 400 },
    );
  }
  if (typeof body.slotKey !== "string" || body.slotKey.length === 0) {
    return NextResponse.json(
      { ok: false, message: "No time was named, so none was held." },
      { status: 400 },
    );
  }

  const { origin, bucket } = bucketFor(request);
  try {
    const outcome = await holdSlot({
      formId: bookingId,
      slotKey: body.slotKey,
      origin,
      bucket,
      clientKey: typeof body.clientKey === "string" ? body.clientKey : null,
    });
    // `taken` is not an error — it is the product working, and it is a 200 so the
    // picker reads the store's sentence instead of a status code.
    return NextResponse.json(
      {
        ok: outcome.state === "held",
        state: outcome.state,
        hold_id: outcome.hold_id,
        expires_at: outcome.expires_at,
        message: outcome.message,
      },
      { status: 200 },
    );
  } catch (thrown) {
    const error = thrown as Error & { hint?: string };
    return NextResponse.json(
      { ok: false, state: "error", message: error.message, hint: error.hint ?? null },
      { status: 400 },
    );
  }
}
