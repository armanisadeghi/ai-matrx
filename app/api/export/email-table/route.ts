import { NextResponse } from "next/server";

import { emailTableExport } from "@/lib/email/exportService";
import { createClient } from "@/utils/supabase/server";

const EMAIL_FORMATS = ["csv", "json", "markdown"] as const;
type EmailFormat = (typeof EMAIL_FORMATS)[number];

/**
 * The email service renders one in-memory HTML/text payload. Keep the wire
 * request below 1 MiB so an untrusted request cannot force unbounded buffering;
 * oversized exports must use the download destination instead.
 */
export const MAX_EMAIL_EXPORT_REQUEST_BYTES = 1_000_000;

class RequestBodyTooLargeError extends Error {}

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
    !/[\u0000-\u001F\u007F]/.test(label) &&
    typeof content === "string" &&
    content.length > 0 &&
    isEmailFormat(format)
  );
}

async function readBoundedJson(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_EMAIL_EXPORT_REQUEST_BYTES
  ) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) throw new SyntaxError("Request body is required");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_EMAIL_EXPORT_REQUEST_BYTES) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
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

    const body = await readBoundedJson(request);
    if (!isEmailExportRequest(body)) {
      return NextResponse.json(
        {
          success: false,
          msg: "A label, format (csv, json, or markdown), and non-empty content are required",
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
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        {
          success: false,
          msg: "This export is too large to email. Download it instead.",
        },
        { status: 413 },
      );
    }
    console.error("Error in POST /api/export/email-table:", error);
    return NextResponse.json(
      { success: false, msg: "Failed to send email" },
      { status: 500 },
    );
  }
}
