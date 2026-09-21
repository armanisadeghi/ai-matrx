// app/api/bookings/[bookingId]/confirm/route.ts — WHERE AN APPOINTMENT BECOMES REAL.
//
// The details, once a time is held. The honeypot is lifted out of the answers
// before they are sent on, exactly as the public form's submit route does, so
// the decoy's name never becomes a field key the door has to refuse.
//
// THE BUCKET MUST BE THE SAME ONE THE HOLD WAS TAKEN WITH. It is what makes a
// hold this visitor's rather than anybody's, and `bucketFor` is the one
// definition both routes use. This lane measured the alternative on 2026-09-20:
// keying the holder on the per-request idempotency key refused every real
// browser its own appointment.
//
// It decides nothing else. Whether the hold is live, whether the payload names a
// key the page does not ask for, the required answers, the cap, the rate window,
// the quarantine Rule and the notification are all the door's.

import { NextResponse } from "next/server";

import { bucketFor, confirmBooking, publicBooking } from "@/features/booking/service";
import { typedAnswersFor } from "@/features/unified-data/typedAnswers";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const { bookingId } = await params;

  let body: { holdId?: string; values?: Record<string, unknown>; clientKey?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "Your details did not arrive as readable JSON, so nothing was booked." },
      { status: 400 },
    );
  }
  if (typeof body.holdId !== "string" || body.holdId.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        state: "hold_lost",
        message: "No held time was named, so nothing was booked. Pick a time and it will be held for you.",
      },
      { status: 400 },
    );
  }

  const page = await publicBooking(bookingId).catch(() => null);
  if (!page) {
    return NextResponse.json(
      { ok: false, message: "This booking page is not available. The link may be wrong, or it may have been taken down." },
      { status: 404 },
    );
  }

  const values = { ...(body.values ?? {}) };
  let honeypot: string | null = null;
  if (page.honeypot_key && page.honeypot_key in values) {
    const raw = values[page.honeypot_key];
    honeypot = typeof raw === "string" ? raw : raw == null ? null : String(raw);
    delete values[page.honeypot_key];
  }

  // A BROWSER INPUT HANDS OVER A STRING AND A FIELD TAKES A VALUE. Until
  // 2026-09-21 these answers went to the door exactly as typed, so a booking
  // page over any table with a number field answered "Vehicle Year takes a
  // number, and it was given a string" and made no appointment. The coercion
  // is `@ai-matrx/records`' — the same body the grid's paste uses — and the
  // refusal it gives back names the question in the person's own words.
  const typed = typedAnswersFor(page.fields, values);
  if (typed.refusal) {
    return NextResponse.json(
      {
        ok: false,
        state: "error",
        message: typed.refusal,
        hint: "Your time is still held. Change the answer it names and book again.",
      },
      { status: 400 },
    );
  }

  const { origin, bucket } = bucketFor(request);
  try {
    const outcome = await confirmBooking({
      formId: bookingId,
      holdId: body.holdId,
      origin,
      bucket,
      values: typed.values,
      honeypot,
      clientKey: typeof body.clientKey === "string" ? body.clientKey : null,
    });
    const done = outcome.state === "booked" || outcome.state === "held";
    return NextResponse.json(
      {
        ok: done,
        state: outcome.state,
        booking_ref: outcome.booking_ref,
        slot_at: outcome.slot_at,
        message: outcome.message,
      },
      { status: 200 },
    );
  } catch (thrown) {
    // THE STORE'S OWN WORDS. It names the key it does not have and every missing
    // required answer, which is what lets the screen point at the question.
    const error = thrown as Error & { hint?: string };
    return NextResponse.json(
      { ok: false, state: "error", message: error.message, hint: error.hint ?? null },
      { status: 400 },
    );
  }
}
