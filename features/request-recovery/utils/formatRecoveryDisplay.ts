import type { PayloadRecord } from "@/lib/persistence/payloadSafetyStore";
import { formatVariablesForDisplay } from "@/features/agents/utils/variable-utils";

function extractMessageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter(
      (part): part is { type: string; text: string } =>
        part != null &&
        typeof part === "object" &&
        (part as { type?: string }).type === "text" &&
        typeof (part as { text?: string }).text === "string",
    )
    .map((part) => part.text)
    .join("\n");
}

/** Best-effort user-authored text from a stored payload. */
export function extractUserInput(
  payload: unknown,
  rawUserInput?: string,
): string {
  if (rawUserInput?.trim()) return rawUserInput;

  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";

  const record = payload as Record<string, unknown>;

  if (typeof record.content === "string") return record.content;
  if (typeof record.input === "string") return record.input;
  if (typeof record.text === "string") return record.text;
  if (typeof record.user_input === "string") return record.user_input;

  if (Array.isArray(record.messages)) {
    const userMessages = record.messages.filter(
      (message): message is { role: string; content: unknown } =>
        message != null &&
        typeof message === "object" &&
        (message as { role?: string }).role === "user",
    );
    const last = userMessages[userMessages.length - 1];
    if (last) return extractMessageText(last.content);
  }

  return "";
}

export function extractVariables(
  payload: unknown,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const variables = (payload as Record<string, unknown>).variables;
  if (
    variables &&
    typeof variables === "object" &&
    !Array.isArray(variables) &&
    Object.keys(variables).length > 0
  ) {
    return variables as Record<string, unknown>;
  }
  return null;
}

export function formatPayloadJson(payload: unknown): string {
  if (typeof payload === "string") return payload;
  return JSON.stringify(payload, null, 2);
}

/** Plain text the user can paste back into a composer. */
export function buildHumanReadableRecoveryText(
  record: Pick<PayloadRecord, "payload" | "rawUserInput">,
): string {
  const input = extractUserInput(record.payload, record.rawUserInput);
  const variables = extractVariables(record.payload);
  const variableLines = variables ? formatVariablesForDisplay(variables) : "";

  if (input && variableLines) {
    return `${input}\n\n--- Variables ---\n${variableLines}`;
  }
  if (variableLines) return variableLines;
  return input;
}
