// app/api/forms/[formId]/visit/route.ts — A VISIT TO A PUBLIC FORM, COUNTED (lane TYPEFORM-DUP).
//
// The page posts `view` when it opens, `start` at the first answer and `reach` as each question is
// shown, with a random key it holds in memory for this one visit. The store keeps only the key's
// hash (`custom.form_visit`) and the owner reads the counts in Results (`custom.form_results`).
// No cookie and no third party: this is the form's own origin answering, so it works inside an
// iframe on somebody else's site with third-party cookies blocked.

import { NextResponse } from "next/server";

import { markFormVisit } from "@/features/forms/service";

export const dynamic = "force-dynamic";

const EVENTS = new Set(["view", "start", "reach"]);

export async function POST(request: Request, { params }: { params: Promise<{ formId: string }> }) {
  const { formId } = await params;
  let body: { visit?: unknown; event?: unknown; field?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const visit = typeof body.visit === "string" ? body.visit : "";
  const event = typeof body.event === "string" && EVENTS.has(body.event) ? (body.event as "view" | "start" | "reach") : null;
  if (!event || !/^[A-Za-z0-9_-]{16,128}$/.test(visit)) return NextResponse.json({ ok: false }, { status: 400 });
  try {
    const state = await markFormVisit({ formId, visit, event, field: typeof body.field === "string" ? body.field : null });
    return NextResponse.json({ ok: true, state });
  } catch (thrown) {
    // A count that could not be kept never stops the person answering; the server log says why.
    console.error(`[forms/visit] custom.form_visit refused for form ${formId}: ${(thrown as Error).message}`);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
