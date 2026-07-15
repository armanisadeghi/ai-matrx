// Super-Admin-only: generate a magic-link or password-recovery link for a user.
//
// POST { userId?: string, email?: string, type: "magiclink" | "recovery",
//        send?: boolean }
//   → generates the link via the service-role admin client (auth.admin
//     .generateLink), optionally emails it to the user, and returns the
//     action_link so an admin can also copy/send it directly (support flow).
//
// Gated by requireSuperAdmin(). generateLink does NOT need the user's session
// (unlike the anon resetPasswordForEmail), so an admin can trigger it for
// anyone. This is the "send a magic link / reset a password" row action.

import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdmin } from "@/utils/auth/adminUtils";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { sendEmail } from "@/lib/email/client";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  const status = message.startsWith("Unauthorized")
    ? 401
    : message.startsWith("Forbidden")
      ? 403
      : 400;
  return NextResponse.json({ error: message }, { status });
}

type LinkType = "magiclink" | "recovery";

function emailBody(type: LinkType, actionLink: string): { subject: string; html: string } {
  const isMagic = type === "magiclink";
  const subject = isMagic ? "Your AI Matrx sign-in link" : "Reset your AI Matrx password";
  const cta = isMagic ? "Sign in to AI Matrx" : "Reset your password";
  const intro = isMagic
    ? "Use the button below to sign in. This link is single-use and expires shortly."
    : "We received a request to reset your password. Use the button below to choose a new one.";
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
      <h2 style="margin:0 0 12px">${subject}</h2>
      <p style="margin:0 0 20px;color:#475569">${intro}</p>
      <a href="${actionLink}" style="display:inline-block;background:#0ea5e9;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">${cta}</a>
      <p style="margin:20px 0 0;color:#94a3b8;font-size:12px">If you didn't expect this, you can ignore this email.</p>
    </div>`;
  return { subject, html };
}

export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();
  } catch (e) {
    return errorResponse(e);
  }

  const body = (await request.json().catch(() => null)) as {
    userId?: string;
    email?: string;
    type?: LinkType;
    send?: boolean;
  } | null;

  const type = body?.type;
  if (type !== "magiclink" && type !== "recovery") {
    return NextResponse.json(
      { error: "type must be 'magiclink' or 'recovery'" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Resolve the email (prefer explicit, else look up by userId).
  let email = body?.email ?? null;
  if (!email && body?.userId) {
    const { data, error } = await admin.auth.admin.getUserById(body.userId);
    if (error || !data?.user?.email) {
      return NextResponse.json(
        { error: error?.message ?? "User has no email" },
        { status: 404 },
      );
    }
    email = data.user.email;
  }
  if (!email) {
    return NextResponse.json(
      { error: "email or userId is required" },
      { status: 400 },
    );
  }

  const { data, error } = await admin.auth.admin.generateLink({ type, email });
  if (error || !data?.properties?.action_link) {
    return NextResponse.json(
      { error: error?.message ?? "Failed to generate link" },
      { status: 500 },
    );
  }
  const actionLink = data.properties.action_link;

  let emailed = false;
  if (body?.send) {
    const { subject, html } = emailBody(type, actionLink);
    const res = await sendEmail({ to: email, subject, html });
    emailed = res.success;
    if (!res.success) {
      return NextResponse.json(
        {
          error:
            res.error instanceof Error
              ? res.error.message
              : "Link generated but email failed",
          action_link: actionLink,
        },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ action_link: actionLink, email, emailed });
}
