"use client";

// app/(link)/b/manage/[ref]/ManageBooking.tsx — MOVE IT, OR CANCEL IT.
//
// TWO THINGS THIS SCREEN REFUSES TO DO, both of them things booking pages
// commonly do:
//
//   · It does not show the person's OWN time greyed out as "taken" beside a
//     Reschedule button. The store marks it `mine`, and a screen that says no to
//     itself is a screen nobody trusts.
//   · It does not cancel on one tap. Cancelling frees an hour somebody may have
//     waited for, so the button says what will happen and asks once — and the
//     confirm step names the actual time, not "this booking".
//
// A cancelled appointment is KEPT and marked, never deleted, so the page can
// still say honestly what happened rather than 404ing on its own link.

import { useMemo, useState } from "react";

import type { BookingSlot, ManagedBooking as Managed } from "@/features/booking/service";

/** What the manage route answers. Declared so a fallback cannot narrow the union. */
interface MoveAnswer {
  state?: string;
  slot_at?: string | null;
  message?: string | null;
}
interface CancelAnswer {
  state?: string;
  message?: string | null;
}

export function ManageBooking({ booking }: { booking: Managed }) {
  const [slots, setSlots] = useState<BookingSlot[]>(booking.slots);
  const [at, setAt] = useState<string | null>(booking.slot_at);
  const [state, setState] = useState(booking.state);
  const [note, setNote] = useState<string | null>(booking.message);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const days = useMemo(() => groupByDay(slots.filter((s) => !s.taken || s.mine)), [slots]);

  async function move(slot: BookingSlot) {
    setBusy(slot.key);
    setNote(null);
    const answer = await fetch(`/api/bookings/manage/${booking.booking_ref}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slotKey: slot.key }),
    })
      .then((r) => r.json() as Promise<MoveAnswer>)
      .catch<MoveAnswer>(() => ({
        state: "error",
        message: "That did not reach us, so your appointment was not moved.",
      }));
    setBusy(null);
    if (answer.state === "moved") {
      setAt(answer.slot_at ?? slot.at);
      setSlots((was) => was.map((s) => ({ ...s, mine: s.key === slot.key, taken: s.key === slot.key ? false : s.taken })));
      setNote("Your appointment has been moved, and whoever you are seeing has been told.");
      return;
    }
    // taken / not_offered / unchanged / cancelled — the store's own sentence,
    // and the appointment is exactly where it was.
    setNote(answer.message ?? "Your appointment was not moved.");
  }

  async function cancel() {
    setBusy("cancel");
    const answer = await fetch(`/api/bookings/manage/${booking.booking_ref}`, { method: "DELETE" })
      .then((r) => r.json() as Promise<CancelAnswer>)
      .catch<CancelAnswer>(() => ({
        state: "error",
        message: "That did not reach us, so nothing was cancelled.",
      }));
    setBusy(null);
    setConfirmingCancel(false);
    if (answer.state === "cancelled") {
      setState("cancelled");
      setNote(answer.message ?? "This appointment is cancelled and that time is free again.");
      return;
    }
    setNote(answer.message ?? "Nothing was cancelled.");
  }

  if (state === "cancelled") {
    return (
      <section className="mt-6 flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {note ?? "This appointment was cancelled, so that time is free again."}
        </p>
      </section>
    );
  }

  if (state === "held") {
    return (
      <section className="mt-6 flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {note ?? "Your details are waiting for someone to confirm them, so there is nothing to move yet."}
        </p>
      </section>
    );
  }

  return (
    <section className="mt-6 flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted-foreground">Your appointment</span>
        <span className="text-base font-medium">{at ? whenText(at) : "—"}</span>
      </div>

      {note ? <p className="rounded border px-3 py-2 text-sm">{note}</p> : null}

      {confirmingCancel ? (
        <div className="flex flex-col gap-3 rounded border border-destructive px-3 py-3">
          <p className="text-sm">
            Cancelling gives up {at ? whenText(at) : "this time"} and puts it back on offer. You would
            have to book again, and the time may be gone.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="h-11 rounded bg-destructive px-4 text-sm font-medium text-destructive-foreground disabled:opacity-60"
              disabled={busy !== null}
              onClick={() => void cancel()}
            >
              {busy === "cancel" ? "Cancelling…" : "Yes, cancel it"}
            </button>
            <button
              type="button"
              className="h-11 rounded border border-input px-4 text-sm"
              onClick={() => setConfirmingCancel(false)}
            >
              Keep it
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="self-start rounded px-1 text-sm underline underline-offset-2"
          onClick={() => setConfirmingCancel(true)}
        >
          Cancel this appointment
        </button>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="text-sm font-medium">Move it to</h2>
        {days.length === 0 ? (
          <p className="rounded border border-dashed px-3 py-2 text-sm text-muted-foreground">
            There is no other time free inside the hours this is offered in.
          </p>
        ) : (
          days.map(([day, inDay]) => (
            <div key={day} className="flex flex-col gap-2">
              <h3 className="text-sm text-muted-foreground">{day}</h3>
              <ol className="flex flex-wrap gap-2">
                {inDay.map((slot) => (
                  <li key={slot.key}>
                    {slot.mine ? (
                      <span className="inline-flex h-11 items-center rounded border border-primary px-3 text-sm">
                        {clockText(slot.at)} · yours
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="h-11 rounded border border-input px-3 text-sm hover:bg-accent disabled:opacity-50"
                        disabled={busy !== null}
                        onClick={() => void move(slot)}
                      >
                        {busy === slot.key ? "Moving…" : clockText(slot.at)}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function zoneText(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

function groupByDay(slots: BookingSlot[]): Array<[string, BookingSlot[]]> {
  const out = new Map<string, BookingSlot[]>();
  for (const slot of slots) {
    const day = new Date(slot.at).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const zone = zoneText();
    const key = zone ? `${day} · ${zone}` : day;
    const bucket = out.get(key);
    if (bucket) bucket.push(slot);
    else out.set(key, [slot]);
  }
  return [...out.entries()];
}

function clockText(at: string): string {
  return new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function whenText(at: string): string {
  return new Date(at).toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
}
