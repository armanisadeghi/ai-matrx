import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { createClient } from "@/utils/supabase/server";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { sendEmail, isValidFromAddress, getDefaultFromAddress, getAllowedEmailDomains } from "@/lib/email/client";

/**
 * POST /api/admin/email
 * Send email to one or more users (admin only)
 */
export async function POST(request: Request) {
  // Verify admin access
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return NextResponse.json(
      { success: false, msg: "Unauthorized" },
      { status: 401 }
    );
  }

  // Highest-bar gate: Super Admin only.
  const adminSupabase = createAdminClient();
  const isSuperAdmin = await checkIsSuperAdmin(adminSupabase, authUser.id);

  if (!isSuperAdmin) {
    return NextResponse.json(
      { success: false, msg: "Forbidden - Super Admin access required" },
      { status: 403 }
    );
  }

  try {
    const body = await request.json();
    const { to, subject, message, userIds, from, sendAsUser } = body;

    // Validate required fields
    if (!subject || !message) {
      return NextResponse.json(
        { success: false, msg: "Subject and message are required" },
        { status: 400 }
      );
    }

    // Build sender address
    // When sendAsUser is true, use the authenticated user's name as the display name
    // and set replyTo to their actual email
    let senderAddress: string | undefined;
    let replyToAddress: string | undefined;
    const senderFullName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || null;
    const senderEmail = authUser.email;

    if (sendAsUser) {
      // Format: "User Name via AI Matrx" <platform-email@domain.com>
      const defaultFrom = getDefaultFromAddress();
      const emailMatch = defaultFrom.match(/<([^>]+)>/) || defaultFrom.match(/([^\s<>]+@[^\s<>]+)/);
      const platformEmail = emailMatch ? emailMatch[1] : defaultFrom;
      const displayName = senderFullName || senderEmail || 'A user';
      senderAddress = `${displayName} via AI Matrx <${platformEmail}>`;
      replyToAddress = senderEmail || undefined;
    } else if (from && from.trim()) {
      // Custom from address (legacy admin behavior)
      if (!isValidFromAddress(from)) {
        const allowedDomains = getAllowedEmailDomains();
        return NextResponse.json(
          { 
            success: false, 
            msg: `Invalid sender domain. Allowed domains: ${allowedDomains.join(", ") || "not configured"}` 
          },
          { status: 400 }
        );
      }
      senderAddress = from.trim();
    }

    // Determine recipients
    let recipients: string[] = [];

    if (to && Array.isArray(to) && to.length > 0) {
      // Direct email addresses provided
      recipients = to;
    } else if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      // Fetch emails by user IDs using RPC (securely accesses auth.users)
      const { data: users, error } = await adminSupabase
        .rpc("get_user_emails_by_ids", { user_ids: userIds });

      if (error) {
        console.error("Error fetching user emails:", error);
        return NextResponse.json(
          { success: false, msg: "Error fetching user emails" },
          { status: 500 }
        );
      }

      recipients = users?.map((u: { email: string }) => u.email).filter(Boolean) || [];
    } else {
      return NextResponse.json(
        { success: false, msg: "Either 'to' or 'userIds' must be provided" },
        { status: 400 }
      );
    }

    if (recipients.length === 0) {
      return NextResponse.json(
        { success: false, msg: "No valid recipients found" },
        { status: 400 }
      );
    }

    // Build HTML email
    const senderDisplayName = senderFullName || senderEmail || 'A member';
    const htmlContent = sendAsUser
      ? `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">AI Matrx</h1>
        </div>
        <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <div style="background: #f0f4ff; border: 1px solid #dbeafe; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px;">
            <p style="margin: 0; font-size: 14px; color: #1e40af;">
              <strong>${senderDisplayName}</strong>${senderEmail ? ` (${senderEmail})` : ''} sent you this message via AI Matrx
            </p>
          </div>
          <div style="white-space: pre-wrap; color: #374151; line-height: 1.6;">${message}</div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            This message was sent by ${senderDisplayName} using AI Matrx. 
            ${senderEmail ? `You can reply directly to ${senderEmail}.` : ''}
            AI Matrx is not responsible for the content of user-sent messages.
          </p>
        </div>
      </div>
    `
      : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%); padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">AI Matrx</h1>
        </div>
        <div style="background: #ffffff; padding: 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <div style="white-space: pre-wrap; color: #374151; line-height: 1.6;">${message}</div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            This email was sent from AI Matrx. If you have any questions, please contact our support team.
          </p>
        </div>
      </div>
    `;

    // Send emails (batch for multiple recipients)
    const results = await Promise.allSettled(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject,
          html: htmlContent,
          from: senderAddress,
          replyTo: replyToAddress,
        })
      )
    );

    const successful = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
    const failed = results.filter((r) => r.status === "rejected" || (r.status === "fulfilled" && !r.value.success)).length;

    // Log the email send operation
    await adminSupabase.schema("admin").from("admin_email_logs").insert({
      sent_by: authUser.id,
      recipient_count: recipients.length,
      subject,
      successful_count: successful,
      failed_count: failed,
    });

    return NextResponse.json({
      success: true,
      msg: `Email sent to ${successful} recipient(s)${failed > 0 ? `, ${failed} failed` : ""}`,
      data: { successful, failed, total: recipients.length },
    });
  } catch (error) {
    console.error("Error in POST /api/admin/email:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to send email" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/email
 * Get email config and templates
 */
export async function GET() {
  // Return available email templates and config for the admin UI
  const templates = [
    {
      id: "welcome",
      name: "Welcome Message",
      subject: "Welcome to AI Matrx!",
      message: `Hello,

We're excited to have you as part of the AI Matrx community! Here are a few tips to get started:

1. Explore our prompt library
2. Create your first canvas
3. Collaborate with your team

If you have any questions, don't hesitate to reach out.

Best,
The AI Matrx Team`,
    },
    {
      id: "announcement",
      name: "General Announcement",
      subject: "Important Update from AI Matrx",
      message: `Hello,

We have an important announcement to share with you.

[Your announcement content here]

Thank you for being part of our community!

Best,
The AI Matrx Team`,
    },
    {
      id: "feature-update",
      name: "Feature Update",
      subject: "New Features Available",
      message: `Hello,

We're excited to announce new features now available on AI Matrx:

• [Feature 1]
• [Feature 2]
• [Feature 3]

Log in to explore these new capabilities!

Best,
The AI Matrx Team`,
    },
  ];

  return NextResponse.json({ 
    success: true, 
    data: templates,
    config: {
      defaultFrom: getDefaultFromAddress(),
      allowedDomains: getAllowedEmailDomains(),
    },
  });
}
