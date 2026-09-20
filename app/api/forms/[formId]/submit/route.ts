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

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const bucket = forwarded && forwarded.length > 0 ? forwarded : origin;

  try {
    const outcome = await submitPublicForm({
      formId,
      origin,
      bucket,
      values,
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
