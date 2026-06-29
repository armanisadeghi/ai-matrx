import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/adminClient";
import { checkIsSuperAdmin } from "@/utils/supabase/userSessionData";
import { ensureOrgIdServer } from "@/lib/organizations/personalOrg";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { sendEmail } from "@/lib/email/client";
import { emailTemplates } from "@/lib/email/client";
import { getContactRatelimiter } from "@/lib/rate-limit/client";
import { ipRateLimit } from "@/lib/rate-limit/helpers";

/**
 * POST /api/contact
 * Handle contact form submissions
 */
export async function POST(request: NextRequest) {
  try {
    // Rate limit: 3 contact submissions per IP per hour
    const rateLimited = await ipRateLimit(request, getContactRatelimiter());
    if (rateLimited) {
      return NextResponse.json(
        { success: false, msg: "Too many submissions. Please try again later." },
        { status: 429 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body = await request.json();
    const { name, email, subject, message } = body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { success: false, msg: "All fields are required" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, msg: "Invalid email address" },
        { status: 400 }
      );
    }

    // Save submission to database
    const adminSupabase = createAdminClient();
    // Signed-in submitters get their own org; anonymous submissions home to
    // the global system org (no individual owner).
    const organizationId = user
      ? await ensureOrgIdServer(supabase, undefined)
      : await resolveSystemOrgId(adminSupabase);
    const { data: submission, error: dbError } = await adminSupabase
      .from("contact_submissions")
      .insert({
        organization_id: organizationId,
        user_id: user?.id || null,
        name,
        email,
        subject,
        message,
        status: "new",
      })
      .select()
      .single();

    if (dbError) {
      console.error("Error saving contact submission:", dbError);
      return NextResponse.json(
        { success: false, msg: "Failed to save submission" },
        { status: 500 }
      );
    }

    // Send notification email to admin if configured
    if (process.env.ADMIN_EMAIL) {
      const notificationTemplate = emailTemplates.contactFormNotification(
        name,
        email,
        subject,
        message,
        submission.id
      );

      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: notificationTemplate.subject,
        html: notificationTemplate.html,
        replyTo: email, // Allow admin to reply directly
      });
    }

    // Send confirmation email to submitter
    const confirmationTemplate = emailTemplates.contactFormConfirmation(name);
    const confirmResult = await sendEmail({
      to: email,
      subject: confirmationTemplate.subject,
      html: confirmationTemplate.html,
    });

    // Don't fail the request if confirmation email fails
    if (!confirmResult.success) {
      console.warn("Failed to send confirmation email:", confirmResult.error);
    }

    return NextResponse.json({
      success: true,
      msg: "Thank you for your message. We'll get back to you soon!",
      data: { submissionId: submission.id },
    });
  } catch (error) {
    console.error("Error in POST /api/contact:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to process contact form" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/contact
 * Get contact form submissions (admin only)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized" },
        { status: 401 }
      );
    }

    // Highest-bar gate: Super Admin only.
    const adminSupabase = createAdminClient();
    const isSuperAdmin = await checkIsSuperAdmin(adminSupabase, user.id);

    if (!isSuperAdmin) {
      return NextResponse.json(
        { success: false, msg: "Forbidden - Super Admin access required" },
        { status: 403 }
      );
    }

    // Get query parameters
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") || "new";
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Fetch submissions
    let query = adminSupabase
      .from("contact_submissions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data: submissions, error, count } = await query;

    if (error) {
      console.error("Error fetching contact submissions:", error);
      return NextResponse.json(
        { success: false, msg: "Failed to fetch submissions" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: submissions,
      pagination: {
        total: count || 0,
        limit,
        offset,
        hasMore: (count || 0) > offset + limit,
      },
    });
  } catch (error) {
    console.error("Error in GET /api/contact:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to fetch submissions" },
      { status: 500 }
    );
  }
}
