// app/api/bookings/manage/[ref]/route.ts — A PERSON'S OWN APPOINTMENT.
//
// PATCH moves it, DELETE cancels it, both by the 128-bit link the visitor was
// given at confirm. That link is NOT the record id: somebody who was sent a
// confirmation must be able to change their own time without an account and
// without being able to name anybody else's.
//
// The store does both halves of a move in one transaction — the booking's time
// and the calendar hold — and takes the new hold BEFORE letting the old one go,
// so a lost race leaves the appointment exactly where it was. None of that is
// decided here.

import { NextResponse } from "next/server";

import { bucketFor, cancelBooking, rescheduleBooking } from "@/features/booking/service";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;

  let body: { slotKey?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "That request did not arrive as readable JSON, so nothing was moved." },
      { status: 400 },
    );
  }
  if (typeof body.slotKey !== "string" || body.slotKey.length === 0) {
    return NextResponse.json(
      { ok: false, message: "No new time was named, so nothing was moved." },
      { status: 400 },
    );
  }

  const { origin, bucket } = bucketFor(request);
  try {
    const outcome = await rescheduleBooking({ ref, slotKey: body.slotKey, origin, bucket });
    return NextResponse.json(
      {
        ok: outcome.state === "moved",
        state: outcome.state,
        slot_at: outcome.slot_at,
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

export async function DELETE(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;
  const { origin } = bucketFor(request);
  try {
    const outcome = await cancelBooking({ ref, origin });
    return NextResponse.json(
      { ok: outcome.state === "cancelled", state: outcome.state, message: outcome.message },
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
