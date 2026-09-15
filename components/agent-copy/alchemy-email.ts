import type { Artifact, TransferOutcome } from "@ai-matrx/kit/content-transfer";

const EMAIL_FORMATS = new Set(["csv", "json", "markdown"]);

type EmailResponse = {
  success?: unknown;
  msg?: unknown;
};

function messageFrom(response: EmailResponse | null): string {
  return typeof response?.msg === "string"
    ? response.msg
    : "The email could not be sent. Try again.";
}

async function readEmailResponse(response: Response): Promise<EmailResponse | null> {
  try {
    const body: unknown = await response.json();
    return typeof body === "object" && body !== null
      ? (body as EmailResponse)
      : null;
  } catch {
    return null;
  }
}

/** Send the already sealed Alchemy artifact without recapturing its source. */
export async function sendAlchemyEmail(
  artifact: Artifact,
  context: { label: string; signal: AbortSignal },
): Promise<TransferOutcome> {
  if (!EMAIL_FORMATS.has(artifact.format)) {
    return {
      status: "error",
      code: "unsupported_email_format",
      message: "Email supports CSV, JSON, and Markdown exports.",
      retryable: false,
    };
  }

  if (context.signal.aborted) return { status: "cancelled" };

  try {
    const response = await fetch("/api/export/email-table", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: context.signal,
      body: JSON.stringify({
        label: context.label,
        format: artifact.format,
        content: artifact.plainText,
      }),
    });
    const body = await readEmailResponse(response);

    if (response.ok && body?.success === true) {
      return {
        status: "success",
        delivered: "action",
        mimeTypes: [],
        message: "Emailed the prepared export to your account email.",
      };
    }

    return {
      status: "error",
      code: "email_send_failed",
      message: messageFrom(body),
      retryable: response.status >= 500 || response.status === 429,
    };
  } catch (error) {
    if (context.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      return { status: "cancelled" };
    }

    return {
      status: "error",
      code: "email_request_failed",
      message: error instanceof Error ? error.message : "The email could not be sent. Try again.",
      retryable: true,
    };
  }
}
