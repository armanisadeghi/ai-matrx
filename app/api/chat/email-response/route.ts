import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { emailChatResponse } from "@/lib/email/exportService";
import { getClaimsUser } from "@/utils/supabase/resolveUser";

/**
 * POST /api/chat/email-response
 * Email an AI chat response to the current user
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
    const { content, metadata } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json(
        { success: false, msg: "Content is required" },
        { status: 400 }
      );
    }

    const result = await emailChatResponse({
      to: user.email,
      content,
      metadata: {
        ...metadata,
        timestamp: new Date().toLocaleString(),
      },
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        msg: "Email sent successfully",
      });
    }

    return NextResponse.json(
      { success: false, msg: result.message, error: result.error },
      { status: 500 }
    );
  } catch (error) {
    console.error("Error in POST /api/chat/email-response:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to send email" },
      { status: 500 }
    );
  }
}
