// app/api/forms/[formId]/asks/route.ts — WHICH QUESTIONS A STRANGER IS ASKED NEXT.
//
// Lane FORMS-FIX-1. The public form's conditional logic used to be inert: the page had no
// evaluator, so every "ask this only when …" question was shown to everybody. The answer is
// the STORE's — `custom.form_public_asks` hands each question's own Rule to
// `custom.rule_eval`, the one evaluator — and this route is only the server-lane knock on
// that door, beside `submit/`, for the same reason `submit/` exists: schema `custom` is
// revoked from `anon`, and the browser on the public page holds no key.
//
// It decides nothing. It returns one row per question — asked or not, and the store's own
// sentence when a condition could not be worked out — and the runner obeys it. Missing,
// unpublished, closed and switched-off forms answer an empty list, exactly as the page's own
// read is silent about them.

import { NextResponse } from "next/server";

import { publicFormAsks } from "@/features/forms/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ formId: string }> },
) {
  const { formId } = await params;

  let body: { values?: Record<string, unknown> };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json(
      { ok: false, message: "The answers did not arrive as readable JSON, so nothing was worked out." },
      { status: 400 },
    );
  }
  const values = body.values && typeof body.values === "object" && !Array.isArray(body.values) ? body.values : {};

  try {
    const asks = await publicFormAsks(formId, values);
    return NextResponse.json({
      ok: true,
      asks: asks.map((a) => ({ field: a.field_key, asked: a.asked, said: a.said ?? null })),
    });
  } catch (thrown) {
    // A REFUSED DOOR IS SAID, NEVER GUESSED AROUND. The stranger reads a person's sentence
    // and sees every question; the door's own words go to the server log, where whoever
    // runs this app looks for them (they can name a function, which a patient never needs).
    const error = thrown as Error;
    console.error(`[forms/asks] custom.form_public_asks refused for form ${formId}: ${error.message}`);
    return NextResponse.json(
      {
        ok: false,
        message: "This form could not work out which questions come next, so all of them are shown.",
      },
      { status: 502 },
    );
  }
}
