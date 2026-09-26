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

import { useEffect, useMemo, useState } from "react";

import { coerceTypedAnswer, fieldKindFor, type Field, type FieldKind } from "@ai-matrx/records";

import type { BookingSlot, PublicBooking } from "@/features/booking/service";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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
  // A REFUSAL BELONGS BESIDE ITS QUESTION. Until 2026-09-21 an answer of the
  // wrong shape travelled all the way to the store, which said "Vehicle Year
  // takes a number, and it was given a string" — true, and printed above a
  // fresh list of times with the person's typing gone.
  const [wrongShape, setWrongShape] = useState<Record<string, string>>({});

  const questions = useMemo(
    () => (page.presentation?.questions ?? []).filter((q) => !q.hidden),
    [page.presentation],
  );
  // THE FIELD BEHIND EACH QUESTION, so this page can say what a column takes
  // instead of guessing from the name of the key.
  const fieldFor = useMemo(() => {
    const byKey = new Map<string, Field>();
    for (const f of page.fields) {
      const key = (f as { key?: string }).key;
      if (key) byKey.set(key, f as unknown as Field);
    }
    return byKey;
  }, [page.fields]);

  const labelFor = useMemo(() => {
    const byKey = new Map<string, string>();
    for (const f of page.fields) {
      const key = (f as { key?: string }).key;
      const label = (f as { label?: string }).label;
      if (key) byKey.set(key, label ?? key);
    }
    return byKey;
  }, [page.fields]);

  // ── WHICH CLOCK, AND WHEN — the fix for React #418 on every booking page.
  //
  // These times were formatted with the BROWSER's zone from the first render,
  // which on a server-rendered page is not a browser at all: Next formats them
  // in the server's zone (UTC on our hosting) and the browser then formats the
  // same instants in the visitor's. Every booking page on production logged a
  // recoverable hydration error for that reason, and — worse than the log — the
  // FIRST PAINT a stranger saw showed the appointment times in UTC before
  // hydration silently corrected them. A booking page whose first paint says
  // 17:00 and whose second says 09:00 is a page that lied for a moment about the
  // one fact it exists to state.
  //
  // So the first paint is the ORGANIZATION's own zone — the store's
  // `page.timezone`, identical on the server and in the browser, so there is
  // nothing to mismatch — and the visitor's own zone takes over once the page is
  // hydrated. Neither moment is a guess: the zone in force is printed beside the
  // day, so the screen always says which clock it is showing.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  const organizationZone = page.availability?.timezone ?? "UTC";
  const zone = hydrated ? visitorZone() || organizationZone : organizationZone;
  const days = useMemo(() => groupByDay(slots, zone), [slots, zone]);

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

    // A BROWSER INPUT HANDS OVER A STRING AND A FIELD TAKES A VALUE. The
    // coercion is `@ai-matrx/records`' — the one body the grid's paste, the
    // CSV import and the confirm route on the other side of this fetch all
    // use — so what this page accepts and what the store accepts cannot
    // disagree. The route coerces too: this is the courtesy, that is the
    // contract.
    const coerced: Record<string, unknown> = {};
    const refusedShape: Record<string, string> = {};
    for (const [key, typedIn] of Object.entries(answers)) {
      const field = fieldFor.get(key);
      if (!field) {
        coerced[key] = typedIn;
        continue;
      }
      const answered = coerceTypedAnswer(field, typedIn, {
        label: q_label(key, questions, labelFor),
      });
      if ("refusal" in answered) refusedShape[key] = answered.refusal;
      else coerced[key] = answered.value;
    }
    if (Object.keys(refusedShape).length > 0) {
      setWrongShape(refusedShape);
      return;
    }
    setWrongShape({});

    setStage({ kind: "sending", slot: stage.slot, holdId: stage.holdId, expiresAt: stage.expiresAt });
    const values: Record<string, unknown> = { ...coerced };
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
          {whenText(stage.slot.at, zone)} — {thanks?.body ?? "We have sent a confirmation."}
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
          <span className="font-medium">{whenText(stage.slot.at, zone)}</span>
          <span className="text-muted-foreground">
            held for you{stage.expiresAt ? ` until ${clockText(stage.expiresAt, zone)}` : ""}
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
          const shapeRefusal = wrongShape[q.field];
          const wrong = missing.includes(q.field) || Boolean(shapeRefusal);
          const kind = fieldFor.has(q.field)
            ? fieldKindFor(fieldFor.get(q.field) as Field)
            : null;
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
                {...keyboardFor(kind)}
                autoComplete={autoCompleteFor(kind, q.field)}
                onChange={(e) => {
                  setAnswers((a) => ({ ...a, [q.field]: e.target.value }));
                  // The sentence goes the moment the person changes the thing
                  // it is about; it is never left standing over new typing.
                  setWrongShape((w) => {
                    if (!(q.field in w)) return w;
                    const next = { ...w };
                    delete next[q.field];
                    return next;
                  });
                }}
              />
              {shapeRefusal ? (
                <span className="text-xs text-destructive">{shapeRefusal} <ErrorAlchemyMenu error={shapeRefusal} /></span>
              ) : q.help ? (
                <span className="text-xs text-muted-foreground">{q.help}</span>
              ) : null}
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
        <p className="rounded border border-destructive px-3 py-2 text-sm text-destructive">{refused} <ErrorAlchemyMenu /></p>
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
                      {clockText(slot.at, zone)} · taken
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
                        : clockText(slot.at, zone)}
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
function visitorZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  } catch {
    return "";
  }
}

function groupByDay(slots: BookingSlot[], zone: string): Array<[string, BookingSlot[]]> {
  const out = new Map<string, BookingSlot[]>();
  for (const slot of slots) {
    const day = new Date(slot.at).toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
      ...(zone ? { timeZone: zone } : {}),
    });
    const key = zone ? `${day} · ${zone}` : day;
    const bucket = out.get(key);
    if (bucket) bucket.push(slot);
    else out.set(key, [slot]);
  }
  return [...out.entries()];
}

function clockText(at: string, zone?: string): string {
  return new Date(at).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(zone ? { timeZone: zone } : {}),
  });
}

function whenText(at: string, zone?: string): string {
  return new Date(at).toLocaleString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    ...(zone ? { timeZone: zone } : {}),
  });
}

/** The label this page printed above a question, for a refusal to name it. */
function q_label(
  key: string,
  questions: Array<{ field: string; ask?: string | null }>,
  labelFor: Map<string, string>,
): string {
  const asked = questions.find((q) => q.field === key)?.ask;
  return (asked && asked.trim()) || labelFor.get(key) || key;
}

/**
 * A booking page asks a stranger for their name and how to reach them, on a
 * phone, once. Autofill is the difference between four taps and forty.
 *
 * 🚨 IT READS THE FIELD, NOT THE NAME OF THE KEY (TAILS-3, 2026-09-21). This
 * used to be three regexes over the key — `/mail/`, `/phone|mobile|tel/`,
 * `/name/` — which is the screen inventing its own opinion of a column beside
 * the store's. A Field already DECLARES that it is an email or a phone, and
 * `fieldKindFor` is the one body that reads that declaration. The key is kept
 * only as the fallback for a question whose Field this page could not resolve.
 */
function autoCompleteFor(kind: FieldKind | null, field: string): string | undefined {
  if (kind === "email") return "email";
  if (kind === "phone") return "tel";
  if (kind === null) {
    if (/mail/.test(field)) return "email";
    if (/phone|mobile|tel/.test(field)) return "tel";
  }
  if (/name/.test(field)) return "name";
  return undefined;
}

/**
 * The keyboard a phone raises. A number column that raises a full QWERTY is
 * how "2019" becomes "2O19" one-handed in a driveway.
 */
function keyboardFor(kind: FieldKind | null): { inputMode?: "numeric" | "decimal" | "tel" | "email" } {
  if (kind === "number") return { inputMode: "numeric" };
  if (kind === "currency" || kind === "percent") return { inputMode: "decimal" };
  if (kind === "phone") return { inputMode: "tel" };
  if (kind === "email") return { inputMode: "email" };
  return {};
}
