// app/api/forms/[formId]/draft/resume/route.ts — WHERE WAS I.
//
// Lane S7-PRIME. A person coming back to a public form — on the same browser, or on a second
// device from the link the page gave her — is handed her saved answers by
// `custom.form_draft_read`. The secret arrives in the BODY: the link carries it in the URL
// fragment (`/f/<id>#resume=…`), which no server, proxy or log ever sees, and the page posts it
// here. A place that is gone (sent, expired, closed, never there) answers the store's own
// sentence, and the form starts fresh.

import { NextResponse } from "next/server";

import { readFormDraft } from "@/features/forms/service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ formId: string }> },
) {
  const { formId } = await params;
  let body: { draft?: string | null };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, message: "That link did not arrive as readable JSON." }, { status: 400 });
  }
  const secret = typeof body.draft === "string" ? body.draft.trim() : "";
  if (secret === "") {
    return NextResponse.json({ ok: false, state: "not_found", message: "There is no saved place to open." }, { status: 404 });
  }
  try {
    const read = await readFormDraft(formId, secret);
    if (!read) {
      return NextResponse.json(
        { ok: false, state: "not_found", message: "This form is not available, so there is nothing to pick up." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      {
        ok: read.state === "found",
        state: read.state,
        answers: read.answers ?? null,
        saved_at: read.saved_at,
        expires_at: read.expires_at,
        message: read.message,
      },
      { status: read.state === "found" ? 200 : 404 },
    );
  } catch (thrown) {
    const error = thrown as Error;
    console.error(`[forms/draft/resume] custom.form_draft_read refused for form ${formId}: ${error.message}`);
    return NextResponse.json(
      { ok: false, state: "refused", message: "Your saved answers could not be opened just now. The form starts fresh; nothing you sent is affected." },
      { status: 502 },
    );
  }
}
