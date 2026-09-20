import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { emailShareLink } from "@/lib/email/exportService";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/**
 * POST /api/sharing/email-link
 * Email a share link to the current user
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await getClaimsUser(supabase);

    if (!user?.email) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized or no email on account" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { resourceType, resourceName, shareUrl, message } = body;

    if (!resourceType || !resourceName || !shareUrl) {
      return NextResponse.json(
        { success: false, msg: "resourceType, resourceName, and shareUrl are required" },
        { status: 400 }
      );
    }

    const result = await emailShareLink({
      to: user.email,
      resourceType,
      resourceName,
      shareUrl,
      message,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        msg: "Link emailed successfully",
      });
    }

    return NextResponse.json(
      { success: false, msg: result.message, error: result.error },
      { status: 500 }
    );
  } catch (error) {
    console.error("Error in POST /api/sharing/email-link:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to send email" },
      { status: 500 }
    );
  }
}
