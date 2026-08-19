import { z } from "zod";

export const smsActionAuthorizationSchema = z.object({
  kind: z.literal("sms_consequential_action"),
  version: z.literal(1),
  action_digest: z.string().length(64),
  side_effect_class: z.string().min(1),
  tool_name: z.string().min(1),
  requested_at: z.string().min(1),
  expires_at: z.string().min(1),
  program_key: z.string().nullable().optional(),
  sms_conversation_id: z.string().nullable().optional(),
  sms_inbound_message_id: z.string().nullable().optional(),
});

export type SmsActionAuthorization = z.infer<
  typeof smsActionAuthorizationSchema
>;

const SENSITIVE_ARGUMENT_KEY =
  /(?:password|passphrase|secret|token|api[_-]?key|authorization|credential|private[_-]?key)/i;

export function redactSmsActionArguments(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[nested value hidden]";
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => redactSmsActionArguments(item, depth + 1));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_ARGUMENT_KEY.test(key)
          ? "[sensitive value hidden]"
          : redactSmsActionArguments(item, depth + 1),
      ]),
    );
  }
  if (typeof value === "string" && value.length > 2_000) {
    return `${value.slice(0, 2_000)}…`;
  }
  return value;
}

export function parseSmsActionAuthorization(
  value: unknown,
): SmsActionAuthorization | null {
  const parsed = smsActionAuthorizationSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
