import { NextResponse } from "next/server";

import { emailTableExport } from "@/lib/email/exportService";
import { createClient } from "@/utils/supabase/server";

const EMAIL_FORMATS = ["csv", "json", "markdown"] as const;
type EmailFormat = (typeof EMAIL_FORMATS)[number];
const EMAIL_MIME_BY_FORMAT: Record<EmailFormat, string> = {
  csv: "text/csv;charset=utf-8",
  json: "application/json;charset=utf-8",
  markdown: "text/markdown;charset=utf-8",
};
const MAX_ATTACHMENT_FILENAME_LENGTH = 128;

/**
 * The email service renders one in-memory HTML/text payload. Keep the wire
 * request below 1 MiB so an untrusted request cannot force unbounded buffering;
 * oversized exports must use the download destination instead.
 */
const MAX_EMAIL_EXPORT_REQUEST_BYTES = 1_000_000;

class RequestBodyTooLargeError extends Error {}

function isEmailFormat(value: unknown): value is EmailFormat {
  return typeof value === "string" && EMAIL_FORMATS.includes(value as EmailFormat);
}

function isEmailExportRequest(value: unknown): value is {
  label: string;
  format: EmailFormat;
  content: string;
  filename: string;
  mime: string;
} {
  if (typeof value !== "object" || value === null) return false;

  const { label, format, content, filename, mime } = value as Record<string, unknown>;
  return (
    typeof label === "string" &&
    label.trim().length > 0 &&
    !/[\u0000-\u001F\u007F]/.test(label) &&
    typeof content === "string" &&
    content.length > 0 &&
    isEmailFormat(format) &&
    typeof filename === "string" &&
    filename.length > 0 &&
    filename.length <= MAX_ATTACHMENT_FILENAME_LENGTH &&
    filename !== "." &&
    filename !== ".." &&
    !/[\\/\u0000-\u001F\u007F]/.test(filename) &&
    typeof mime === "string" &&
    mime === EMAIL_MIME_BY_FORMAT[format]
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
          msg: "A label, reviewed filename and file type, supported format, and non-empty content are required",
        },
        { status: 400 },
      );
    }

    const result = await emailTableExport({
      to: user.email,
      tableName: body.label,
      format: body.format,
      content: body.content,
      attachmentFilename: body.filename,
      attachmentMime: body.mime,
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
