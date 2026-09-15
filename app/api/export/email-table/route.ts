import { NextResponse } from "next/server";

import { emailTableExport } from "@/lib/email/exportService";
import { createClient } from "@/utils/supabase/server";

const EMAIL_FORMATS = ["csv", "json", "markdown"] as const;
type EmailFormat = (typeof EMAIL_FORMATS)[number];

function isEmailFormat(value: unknown): value is EmailFormat {
  return typeof value === "string" && EMAIL_FORMATS.includes(value as EmailFormat);
}

function isEmailExportRequest(
  value: unknown,
): value is { label: string; format: EmailFormat; content: string } {
  if (typeof value !== "object" || value === null) return false;

  const { label, format, content } = value as Record<string, unknown>;
  return (
    typeof label === "string" &&
    label.trim().length > 0 &&
    typeof content === "string" &&
    content.length > 0 &&
    isEmailFormat(format)
  );
}

/**
 * Email the exact client-prepared artifact to its authenticated owner.
 *
 * The client owns filtering, sorting, and editing. This endpoint deliberately
 * does not take a table id or read a table, because doing either would replace
 * the artifact the person chose with a newer, differently shaped export.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email) {
      return NextResponse.json(
        { success: false, msg: "Unauthorized or no email on account" },
        { status: 401 },
      );
    }

    const body: unknown = await request.json();
    if (!isEmailExportRequest(body)) {
      return NextResponse.json(
        {
          success: false,
          msg: "label, format (csv, json, or markdown), and non-empty content are required",
        },
        { status: 400 },
      );
    }

    const result = await emailTableExport({
      to: user.email,
      tableName: body.label,
      format: body.format,
      content: body.content,
    });

    if (result.success) {
      return NextResponse.json({
        success: true,
        msg: "Export emailed successfully",
      });
    }

    return NextResponse.json(
      { success: false, msg: result.message, error: result.error },
      { status: 500 },
    );
  } catch (error) {
    console.error("Error in POST /api/export/email-table:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to send email" },
      { status: 500 },
    );
  }
}
