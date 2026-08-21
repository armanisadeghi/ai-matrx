// app/api/unsubscribe/[token]/route.ts
//
// THE RFC 8058 ONE-CLICK UNSUBSCRIBE ENDPOINT.
//
// This is the URL that goes in the `List-Unsubscribe` header of every commercial
// message we send, paired with `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
// Gmail and Yahoo render it as a native "Unsubscribe" button at the top of the
// message; the mail provider POSTs here on the user's behalf.
//
// 🚨 RFC 8058 s.3.2: the unsubscribe MUST complete on this POST with NO further
// confirmation from the user. A "click here to confirm" page violates the
// contract and Gmail treats the header as broken — which is worse than having no
// header at all, because bulk senders are REQUIRED to have a working one.
//
// It is an API route on purpose (and within the CLAUDE.md rule): the caller is an
// external mail provider, unauthenticated and non-browser. That is the webhook
// class, not a React-to-Supabase data read.
//
// Idempotent by construction — providers retry, and a retry must look like
// success, never an error.
//
// Full obligations: common-docs/systems/marketing/outreach-compliance/REQUIREMENTS_MATRIX.md
// (rows US-3/US-4, CA-5, AU-3, OP-4, OP-5).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// The provider's POST is a machine call; nothing here may be cached.
export const dynamic = "force-dynamic";

type UnsubscribeResult = {
  ok: boolean;
  error?: string;
  already_unsubscribed?: boolean;
  organization_name?: string | null;
};

async function unsubscribe(
  token: string,
  userAgent: string | null,
  reason: string,
): Promise<UnsubscribeResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("outreach_unsubscribe", {
    p_token: token,
    // The generated RPC args are optional, not nullable — pass undefined to
    // omit rather than widening the generated type.
    p_user_agent: userAgent ?? undefined,
    p_reason: reason,
  });

  if (error) {
    // Never swallow: an unsubscribe we failed to record is a legal exposure, not
    // a cosmetic bug. Loud, with the token elided — these land in logs.
    console.error("[unsubscribe] RPC failed", {
      tokenPrefix: token.slice(0, 8),
      code: error.code,
      message: error.message,
    });
    return { ok: false, error: "server_error" };
  }
  return (data ?? { ok: false, error: "no_result" }) as UnsubscribeResult;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // RFC 8058 sends `List-Unsubscribe=One-Click` as form data. We read it for the
  // audit trail but deliberately do NOT require it: a provider that posts an
  // empty body still means the person pressed unsubscribe, and refusing them
  // over a body shape would be the exact failure this endpoint exists to avoid.
  let oneClick = false;
  try {
    const body = await request.formData();
    oneClick = body.get("List-Unsubscribe") === "One-Click";
  } catch {
    // No body, or not form-encoded. Proceed anyway.
  }

  const result = await unsubscribe(
    token,
    request.headers.get("user-agent"),
    oneClick ? "one_click_rfc8058" : "post_no_body",
  );

  if (!result.ok && result.error === "server_error") {
    // 5xx tells a well-behaved provider to retry, which is what we want when the
    // failure is ours.
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Everything else — success, already unsubscribed, even an unknown token — is
  // a 200. A provider must never see this endpoint as broken.
  return NextResponse.json({ ok: true }, { status: 200 });
}

// Some providers and security scanners probe with GET before POSTing. Send a
// human to the real page rather than 405-ing them.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  return NextResponse.redirect(
    new URL(`/unsubscribe/${encodeURIComponent(token)}`, _request.url),
    { status: 302 },
  );
}
