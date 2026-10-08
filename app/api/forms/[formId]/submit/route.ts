// app/api/forms/[formId]/submit/route.ts — WHERE A STRANGER'S ANSWER ARRIVES.
//
// A route handler and not a server action, deliberately: this endpoint is also
// what an embedded form on somebody else's site posts to, and a server action is
// an internal calling convention rather than an address.
//
// THE THREE THINGS THIS FILE ADDS that the browser could not be trusted to
// supply, and that are the whole reason `custom.form_submit` is server-lane:
//
//   · the ORIGIN, read from the request's own header. A browser stating its own
//     origin is not a check.
//   · the RATE-LIMIT BUCKET, a coarse client identifier — the forwarded address
//     the platform gives us, falling back to the origin so a deployment that
//     strips it is limited per site rather than not at all. A browser choosing
//     its own bucket would be counting itself.
//   · the HONEYPOT, lifted out of the answers before they are sent on, so the
//     decoy's name never becomes a field key the door has to refuse.
//
// It grants nothing and decides nothing else. Published-or-not, closed, full,
// the cap, the rate window, every exposed key and every required answer are all
// the door's, and its sentences are carried back whole.

import { NextResponse } from "next/server";

import { publicForm, submitPublicForm } from "@/features/forms/service";
import { typedAnswersFor } from "@/features/unified-data/typedAnswers";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ formId: string }> },
) {
  const { formId } = await params;

  let body: { values?: Record<string, unknown>; clientKey?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "That answer did not arrive as readable JSON, so nothing was saved." },
      { status: 400 },
    );
  }

  const values = { ...(body.values ?? {}) };
  // TYPEFORM-DUP: the hidden fields and the visit key ride beside the answers. They are lifted out
  // before the answers are typed against the form's Fields and handed to the door as the two
  // reserved keys `custom.form_submit` reads (`_hidden`, narrowed there to the declared names).
  const hidden =
    values["_hidden"] && typeof values["_hidden"] === "object" && !Array.isArray(values["_hidden"])
      ? (values["_hidden"] as Record<string, unknown>)
      : null;
  const visit = typeof values["_visit"] === "string" ? values["_visit"] : null;
  const timeZone = typeof values["_time_zone"] === "string" ? values["_time_zone"] : null;
  delete values["_hidden"];
  delete values["_visit"];
  delete values["_time_zone"];

  // The form tells us the decoy's name; we take it out of the answers and hand
  // it to the door separately, so a real field can never be mistaken for it and
  // it can never be mistaken for a real field.
  const form = await publicForm(formId).catch(() => null);
  if (!form) {
    return NextResponse.json(
      { ok: false, message: "This form is not available. The link may be wrong, or it may have been taken down." },
      { status: 404 },
    );
  }
  let honeypot: string | null = null;
  if (form.honeypot_key && form.honeypot_key in values) {
    const raw = values[form.honeypot_key];
    honeypot = typeof raw === "string" ? raw : raw == null ? null : String(raw);
    delete values[form.honeypot_key];
  }

  // THE SAME CONTRACT AS THE BOOKING'S CONFIRM ROUTE, AND FOR THE SAME REASON.
  // `FormRunner` draws real editors, so a browser usually sends a number as a
  // number — but this route is the PUBLIC boundary, and a route that trusted
  // the browser to have coerced would be one hand-written POST away from the
  // store's "takes a number, and it was given a string". A value that is
  // already the right shape is left alone.
  const typed = typedAnswersFor(form.fields, values);
  if (typed.refusal) {
    return NextResponse.json(
      { ok: false, state: "error", message: typed.refusal, hint: null },
      { status: 400 },
    );
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const bucket = forwarded && forwarded.length > 0 ? forwarded : origin;

  try {
    const outcome = await submitPublicForm({
      formId,
      origin,
      bucket,
      values: { ...typed.values, ...(hidden ? { _hidden: hidden } : {}), ...(visit ? { _visit: visit } : {}), ...(timeZone ? { _time_zone: timeZone } : {}) },
      honeypot,
      clientKey: typeof body.clientKey === "string" ? body.clientKey : null,
    });
    // `accepted` and `held` are both a successful send; the difference is
    // whether it is in the table yet, and the store's own message says which.
    const sent = outcome.state === "accepted" || outcome.state === "held";
    return NextResponse.json(
      {
        ok: sent,
        state: outcome.state,
        message: outcome.message,
        record_id: outcome.record_id,
      },
      { status: sent ? 200 : 429 },
    );
  } catch (thrown) {
    // THE STORE'S OWN WORDS. It names the field it does not have and every
    // missing required answer, which is what lets the screen point at the
    // question instead of showing one error beside twenty of them.
    const error = thrown as Error & { hint?: string };
    return NextResponse.json(
      { ok: false, message: error.message, hint: error.hint ?? null },
      { status: 400 },
    );
  }
}
