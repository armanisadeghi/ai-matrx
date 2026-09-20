// app/api/portal/[slug]/sign-in/route.ts — WHERE A CLIENT ASKS FOR HER LINK.
//
// POST { email } → always the SAME body, whether or not that address was
// invited. An endpoint that answered differently would be an address oracle:
// anybody could type addresses at it and learn which of a business's clients
// have a portal. `custom.portal_invitation` refuses a signed-in caller in its
// own body for exactly this reason; this route is the other half of that rule.
//
// 🚨 THE LINK AND THE TOKEN ARE NEVER LOGGED, RETURNED OR STORED. They are a
// bearer credential for somebody's account: a single line of `console.log` in a
// server log, or one field in a JSON response, is a sign-in anybody holding that
// log can perform. The link exists in this process only long enough to be handed
// to the mailer.
//
// WHY THE LINK POINTS AT `/auth/confirm` AND NOT AT SUPABASE'S OWN VERIFY URL:
// `app/auth/confirm/route.ts` already verifies `token_hash` + `type=magiclink`
// server-side and then redirects to the `redirectTo` it carries, which sets the
// session as HTTP-only cookies on our own origin. `generateLink` hands back the
// `hashed_token` precisely so an app can build that link itself, and doing so
// keeps the whole flow inside one route we own instead of the implicit-flow
// fragment hop.

import { NextResponse, type NextRequest } from "next/server";

import { sendEmail } from "@/lib/email/client";
import {
  portalInvitation,
  portalPrincipalBind,
  portalPublic,
} from "@/features/portals/service";
import { createAdminClient } from "@/utils/supabase/adminClient";

export const dynamic = "force-dynamic";

/** The ONE sentence. It is the answer for invited, not invited, and already bound. */
const SAME_ANSWER = "If that address is on this portal, a sign-in link is on its way.";

function sameAnswer() {
  return NextResponse.json({ ok: true, message: SAME_ANSWER });
}

/** Deliberately loose: the door decides who is invited, not a regex. */
function looksLikeEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.length <= 320;
}

function emailBody(portalTitle: string, organization: string, link: string) {
  const subject = `Sign in to ${portalTitle}`;
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
      <h2 style="margin:0 0 12px">${portalTitle}</h2>
      <p style="margin:0 0 20px;color:#475569">${organization} uses this portal to share your jobs and invoices with you. Use the button below to sign in. The link is single-use and expires shortly.</p>
      <a href="${link}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Open my portal</a>
      <p style="margin:20px 0 0;color:#94a3b8;font-size:12px">If you didn't ask for this, you can ignore this email.</p>
    </div>`;
  return { subject, html };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  // A portal that is missing, closed, or whose organization has not opened its
  // external lane is a 404 here exactly as it is on the page — the same three
  // questions, the same one answer.
  const portal = await portalPublic(slug);
  if (!portal) {
    return NextResponse.json({ ok: false, message: "This portal is not available." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as { email?: unknown } | null;
  if (!looksLikeEmail(body?.email)) {
    // A malformed address is a shape problem the person can see in the field,
    // not a fact about who is invited — so this one may be specific.
    return NextResponse.json(
      { ok: false, message: "Enter the email address this portal was shared with." },
      { status: 400 },
    );
  }
  const email = body.email.trim();

  const invitation = await portalInvitation(portal.slug, email);
  if (!invitation) return sameAnswer();

  const admin = createAdminClient();

  // The invited address may have no auth user yet — this is the first time
  // anybody clicked. `generateLink` needs one, so make it first, already
  // confirmed: the magic link itself is the proof of the address.
  let userId: string | null = null;
  let hashedToken: string | null = null;

  const first = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (first.error) {
    const created = await admin.auth.admin.createUser({ email, email_confirm: true });
    if (created.error || !created.data?.user?.id) {
      // NOTHING FAILS SILENTLY — but the person still gets the same sentence,
      // because the alternative is telling a stranger that this address IS on
      // the portal and only our side broke. The operator sees it in the logs.
      console.error("portal sign-in: could not create the auth user for an invited address", {
        slug: portal.slug,
        reason: created.error?.message ?? "no user returned",
      });
      return sameAnswer();
    }
    userId = created.data.user.id;
    const second = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (second.error || !second.data?.properties?.hashed_token) {
      console.error("portal sign-in: could not mint a link for an invited address", {
        slug: portal.slug,
        reason: second.error?.message ?? "no hashed_token returned",
      });
      return sameAnswer();
    }
    hashedToken = second.data.properties.hashed_token;
    userId = second.data.user?.id ?? userId;
  } else {
    if (!first.data?.properties?.hashed_token || !first.data?.user?.id) {
      console.error("portal sign-in: generateLink answered without a token or a user", {
        slug: portal.slug,
      });
      return sameAnswer();
    }
    hashedToken = first.data.properties.hashed_token;
    userId = first.data.user.id;
  }

  // THE GRANT IS WRITTEN BEFORE THE LINK IS SENT. If the bind failed and the
  // email went anyway, she would sign in successfully and land on a portal that
  // says she is not a principal of it — the one screen this product must never
  // show to an invited person.
  try {
    await portalPrincipalBind({
      organizationId: invitation.organization_id,
      principalId: invitation.principal_id,
      userId,
    });
  } catch (error) {
    console.error("portal sign-in: custom.portal_principal_bind refused", {
      slug: portal.slug,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return sameAnswer();
  }

  const origin = request.nextUrl.origin;
  const destination = `/portal/c/${encodeURIComponent(portal.slug)}`;
  const link =
    `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}` +
    `&type=magiclink&redirectTo=${encodeURIComponent(destination)}`;

  const { subject, html } = emailBody(portal.title, portal.organization, link);
  const sent = await sendEmail({ to: email, subject, html });
  if (!sent.success) {
    // Announce it where an operator can act; never to the caller, and never
    // with the link in the message.
    console.error("portal sign-in: the mailer refused an invited address", {
      slug: portal.slug,
      reason: sent.error instanceof Error ? sent.error.message : "unknown",
    });
  }

  return sameAnswer();
}
