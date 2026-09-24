// app/api/forms/[formId]/draft/route.ts — KEEP A STRANGER'S PLACE.
//
// Lane S7-PRIME. A person answering a public form who stops part-way used to lose every
// answer the moment the tab closed. The page now saves her place a moment after each change,
// through `custom.form_draft_save`, under a secret only her browser (or the link she copied)
// holds. This route is the server-lane knock on that door, beside `submit/` and `asks/`, for
// the same reason they exist: schema `custom` is revoked from `anon`, and the ORIGIN and the
// client BUCKET are things the server knows and a browser can only assert.
//
// It decides nothing. A saved place is never a record and never a submission; the store's
// state and sentence come back whole. The secret is answered ONCE, on the first save, and
// the route never logs it.

import { NextResponse } from "next/server";

import { publicForm, saveFormDraft } from "@/features/forms/service";
import { typedAnswersFor } from "@/features/unified-data/typedAnswers";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ formId: string }> },
) {
  const { formId } = await params;

  let body: { answers?: Record<string, unknown>; draft?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "The answers did not arrive as readable JSON, so nothing was saved." },
      { status: 400 },
    );
  }
  const answers =
    body.answers && typeof body.answers === "object" && !Array.isArray(body.answers) ? body.answers : {};

  const form = await publicForm(formId).catch(() => null);
  if (!form || form.state === "unavailable") {
    return NextResponse.json(
      { ok: false, message: "This form is not available, so nothing was saved." },
      { status: 404 },
    );
  }
  // The decoy never travels into a saved place, and an unanswered question is not saved as "".
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(answers)) {
    if (key === form.honeypot_key) continue;
    if (value === undefined || value === null || value === "") continue;
    kept[key] = value;
  }
  // The same coercion a sent answer gets, so a saved place never holds what sending refuses.
  // An answer that cannot be its Field's kind yet (a half-typed number) is left out of the
  // save rather than refusing it — the person is still typing.
  const typed = typedAnswersFor(form.fields, kept);
  const values: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(typed.values)) {
    if (!typed.byKey[key]) values[key] = value;
  }

  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const bucket = forwarded && forwarded.length > 0 ? forwarded : origin;

  try {
    const saved = await saveFormDraft({
      formId,
      answers: values,
      secret: typeof body.draft === "string" && body.draft.length > 0 ? body.draft : null,
      bucket,
      origin,
    });
    return NextResponse.json(
      {
        ok: saved.state === "saved",
        state: saved.state,
        draft: saved.draft_secret,
        saved_at: saved.saved_at,
        expires_at: saved.expires_at,
        message: saved.message,
      },
      { status: saved.state === "saved" ? 200 : saved.state === "too_many" ? 429 : 409 },
    );
  } catch (thrown) {
    // THE STORE'S OWN WORDS for the person; its sqlstate-level detail for whoever runs the app.
    const error = thrown as Error & { hint?: string };
    console.error(`[forms/draft] custom.form_draft_save refused for form ${formId}: ${error.message}`);
    return NextResponse.json({ ok: false, state: "refused", message: error.message, hint: error.hint ?? null }, { status: 400 });
  }
}
