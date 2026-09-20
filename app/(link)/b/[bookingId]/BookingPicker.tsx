"use client";

// app/(link)/b/[bookingId]/BookingPicker.tsx — THE ONLY CLIENT CODE ON THE PUBLIC
// BOOKING PAGE.
//
// THE ORDER IS HOLD FIRST, DETAILS SECOND, AND IT IS THE WHOLE DESIGN. A person
// picks a time and the slot is HELD in the database before they are asked for
// their name. Taking the details first and holding after is how two people fill
// in a form and one of them finds out at the end that the time went — which is
// the failure a booking product exists to prevent.
//
// THE REFUSAL IS THE FEATURE. When the hold loses a race, this screen says so,
// in the store's own words, keeps everything the person had typed, and puts them
// back on a fresh list of times. It never shows a spinner, never silently picks
// the next slot, and never lets somebody believe they have an appointment
// somebody else has.
//
// IT DOES NOT DECIDE WHAT IS FREE. The times come from the server, computed by
// `custom._booking_slots`, and a taken one is not a dead button — it is not a
// button. The only thing this file adds is the VISITOR'S TIMEZONE, which is a
// display concern: the same instant, said the way the person reads a clock.

import { useMemo, useState } from "react";

import type { BookingSlot, PublicBooking } from "@/features/booking/service";

/** What the two route handlers answer. Declared so a fallback cannot narrow the union. */
interface HoldAnswer {
  state?: string;
  hold_id?: string | null;
  expires_at?: string | null;
  message?: string | null;
}
interface ConfirmAnswer {
  state?: string;
  booking_ref?: string | null;
  message?: string | null;
}

type Stage =
  | { kind: "picking" }
  | { kind: "holding"; slotKey: string }
  | { kind: "details"; slot: BookingSlot; holdId: string; expiresAt: string | null }
  | { kind: "sending"; slot: BookingSlot; holdId: string; expiresAt: string | null }
  | { kind: "booked"; slot: BookingSlot; ref: string | null }
  | { kind: "sent"; message: string };

export function BookingPicker({ page }: { page: PublicBooking }) {
  const [slots, setSlots] = useState<BookingSlot[]>(page.slots);
  const [stage, setStage] = useState<Stage>({ kind: "picking" });
  const [refused, setRefused] = useState<string | null>(null);
  // THE ANSWERS SURVIVE A LOST RACE. Somebody who typed their name and lost the
  // slot by a second should not have to type it again.
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [decoy, setDecoy] = useState("");
  const [missing, setMissing] = useState<string[]>([]);

  const questions = useMemo(
    () => (page.presentation?.questions ?? []).filter((q) => !q.hidden),
    [page.presentation],
  );
  const labelFor = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const f of page.fields) {
      const key = (f as { key?: string }).key;
      const label = (f as { label?: string }).label;
      if (key) byKey.set(key, label ?? key);
    }
    return byKey;
  }, [page.fields]);

  // The visitor's own clock. `timeZone` is left to the browser on purpose: a
  // page that named the ORGANIZATION's zone would be telling somebody in another
  // country a time they then have to convert themselves.
  const days = useMemo(() => groupByDay(slots), [slots]);

  async function refresh() {
    const answer = await fetch(`/api/bookings/${page.form_id}/hold`, { method: "GET" })
      .then((r) => r.json() as Promise<{ slots?: BookingSlot[] }>)
      .catch(() => ({}) as { slots?: BookingSlot[] });
    if (answer.slots) setSlots(answer.slots);
  }

  async function hold(slot: BookingSlot) {
    setStage({ kind: "holding", slotKey: slot.key });
    setRefused(null);
    const answer = await fetch(`/api/bookings/${page.form_id}/hold`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slotKey: slot.key }),
    })
      .then((r) => r.json() as Promise<HoldAnswer>)
      .catch<HoldAnswer>(() => ({
        state: "error",
        message: "That time could not be held just now. Try again in a moment.",
      }));

    if (answer.state === "held" && answer.hold_id) {
      setStage({ kind: "details", slot, holdId: answer.hold_id, expiresAt: answer.expires_at ?? null });
      return;
    }
    // THE LOSING HALF OF A RACE, IN THE STORE'S OWN WORDS.
    setRefused(answer.message ?? "That time is no longer free.");
    setStage({ kind: "picking" });
    await refresh();
  }

  async function confirm() {
    if (stage.kind !== "details") return;
    const needed = questions
      .filter((q) => q.required && !(answers[q.field] ?? "").trim())
      .map((q) => q.field);
    if (needed.length > 0) {
      setMissing(needed);
      return;
    }
    setMissing([]);
    setStage({ kind: "sending", slot: stage.slot, holdId: stage.holdId, expiresAt: stage.expiresAt });
    const values: Record<string, unknown> = { ...answers };
    if (page.honeypot_key) values[page.honeypot_key] = decoy;
    const answer = await fetch(`/api/bookings/${page.form_id}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ holdId: stage.holdId, values }),
    })
      .then((r) => r.json() as Promise<ConfirmAnswer>)
      .catch<ConfirmAnswer>(() => ({
        state: "error",
        message: "Your details did not reach us, so nothing was booked. Try again.",
      }));

    if (answer.state === "booked") {
      setStage({ kind: "booked", slot: stage.slot, ref: answer.booking_ref ?? null });
      return;
    }
    if (answer.state === "held") {
      setStage({ kind: "sent", message: answer.message ?? "Your details are waiting for someone to confirm them." });
      return;
    }
    // hold_lost, hold_expired, closed, full, too_many — all real sentences, and
    // all of them mean: pick again, with your answers still here.
    setRefused(answer.message ?? "That time is no longer free.");
    setStage({ kind: "picking" });
    await refresh();
  }

  if (stage.kind === "booked") {
    const thanks = page.presentation?.thank_you;
    return (
      <section className="mt-6 flex flex-col gap-3">
        <h2 className="text-base font-medium">{thanks?.title ?? "You're booked"}</h2>
        <p className="text-sm text-muted-foreground">
          {whenText(stage.slot.at)} — {thanks?.body ?? "We have sent a confirmation."}
        </p>
        {stage.ref ? (
          // THE LINK IS SHOWN, NOT ONLY EMAILED. An email can be lost and a
          // confirmation page is the one moment we know the person is looking.
          <p className="text-sm">
            Need to change it?{" "}
            <a className="underline underline-offset-2" href={`/b/manage/${stage.ref}`}>
              Move or cancel this appointment
            </a>
            .
          </p>
        ) : null}
      </section>
    );
  }

  if (stage.kind === "sent") {
    return (
      <section className="mt-6 flex flex-col gap-2">
        <h2 className="text-base font-medium">Thank you</h2>
        <p className="text-sm text-muted-foreground">{stage.message}</p>
      </section>
    );
  }

  if (stage.kind === "details" || stage.kind === "sending") {
    const busy = stage.kind === "sending";
    return (
      <section className="mt-6 flex flex-col gap-4">
        <header className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
          <span className="font-medium">{whenText(stage.slot.at)}</span>
          <span className="text-muted-foreground">
            held for you{stage.expiresAt ? ` until ${clockText(stage.expiresAt)}` : ""}
          </span>
          <button
            type="button"
            className="ml-auto rounded px-2 py-1 text-xs underline underline-offset-2 disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              setStage({ kind: "picking" });
              void refresh();
            }}
          >
            Pick another time
          </button>
        </header>

        {questions.map((q) => {
          const label = q.ask || labelFor.get(q.field) || q.field;
          const wrong = missing.includes(q.field);
          return (
            <label key={q.field} className="flex flex-col gap-1">
              <span className="text-sm">
                {label}
                {q.required ? <span aria-hidden="true"> *</span> : null}
              </span>
              <input
                className={`h-11 rounded border bg-background px-3 text-base ${wrong ? "border-destructive" : "border-input"}`}
                value={answers[q.field] ?? ""}
                required={Boolean(q.required)}
                aria-invalid={wrong || undefined}
                autoComplete={autoCompleteFor(q.field)}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.field]: e.target.value }))}
              />
              {q.help ? <span className="text-xs text-muted-foreground">{q.help}</span> : null}
            </label>
          );
        })}

        {missing.length > 0 ? (
          <p className="text-sm text-destructive">
            {missing.map((k) => (labelFor.get(k) ?? k).toLowerCase()).join(", ")} still{" "}
            {missing.length === 1 ? "needs" : "need"} an answer.
          </p>
        ) : null}

        {/* The decoy, off-screen and never announced. */}
        {page.honeypot_key ? (
          <input
            aria-hidden="true"
            tabIndex={-1}
            autoComplete="off"
            name={page.honeypot_key}
            value={decoy}
            onChange={(e) => setDecoy(e.target.value)}
            className="pointer-events-none absolute left-[-9999px] h-px w-px opacity-0"
          />
        ) : null}

        <button
          type="button"
          className="h-11 rounded bg-primary px-4 text-base font-medium text-primary-foreground disabled:opacity-60"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? "Booking…" : (page.presentation?.submit_label ?? "Book it")}
        </button>
      </section>
    );
  }

  const free = slots.filter((s) => !s.taken).length;
  return (
    <section className="mt-6 flex flex-col gap-4">
      <header className="flex items-baseline gap-2 text-sm">
        <span className="font-medium">Pick a time</span>
        <span className="tabular-nums text-muted-foreground">
          {free} free of {slots.length}
        </span>
      </header>

      {refused ? (
        <p className="rounded border border-destructive px-3 py-2 text-sm text-destructive">{refused}</p>
      ) : null}

      {days.length === 0 ? (
        <p className="rounded border border-dashed px-3 py-2 text-sm text-muted-foreground">
          There is no time left inside the hours this is offered in. More appear here as the days
          move forward — this is empty because the window is over, not because something failed.
        </p>
      ) : (
        days.map(([day, inDay]) => (
          <div key={day} className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">{day}</h2>
            <ol className="flex flex-wrap gap-2">
              {inDay.map((slot) => (
                <li key={slot.key}>
                  {slot.taken ? (
                    // A TAKEN TIME IS NOT A DEAD BUTTON: it is not a button.
                    <span className="inline-flex h-11 items-center rounded border border-dashed px-3 text-sm text-muted-foreground">
                      {clockText(slot.at)} · taken
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="h-11 rounded border border-input px-3 text-sm hover:bg-accent disabled:opacity-50"
                      disabled={stage.kind === "holding"}
                      onClick={() => void hold(slot)}
                    >
                      {stage.kind === "holding" && stage.slotKey === slot.key
                        ? "Holding…"
                        : clockText(slot.at)}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </div>
        ))
      )}
    </section>
  );
}

/** The visitor's own timezone, named once so the page says it rather than implying it. */
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

/**
 * A booking page asks a stranger for their name and how to reach them, on a
 * phone, once. Autofill is the difference between four taps and forty.
 */
function autoCompleteFor(field: string): string | undefined {
  if (/mail/.test(field)) return "email";
  if (/phone|mobile|tel/.test(field)) return "tel";
  if (/name/.test(field)) return "name";
  return undefined;
}
