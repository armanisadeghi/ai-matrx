import { z } from "zod";

const HTTPS_URL = z
  .url({ error: "Must be a valid URL" })
  .refine((value) => value.startsWith("https://"), {
    error: "Must be an https:// URL",
  });

export const CREDENTIAL_ID_REGEX = /^[a-z0-9][a-z0-9-]{1,62}$/;

export const credentialMaintenanceEntrySchema = z
  .object({
    label: z.string().trim().min(1, { error: "Label is required" }),
    generated_at: z.iso.datetime(),
    expires_at: z.iso.datetime(),
    warning_days: z.number().int().min(1).max(365),
    validity_days: z.number().int().min(1).max(3650),
    key_id: z.string().trim().min(1).optional(),
    source_url: HTTPS_URL,
    deployment_url: HTTPS_URL,
    notes: z.string().optional(),
  })
  .catchall(z.unknown())
  .superRefine((entry, context) => {
    if (new Date(entry.expires_at) <= new Date(entry.generated_at)) {
      context.addIssue({
        code: "custom",
        path: ["expires_at"],
        message: "Expiry must be after the generation date",
      });
    }
  });

export const credentialMaintenanceMapSchema = z.record(
  z.string().regex(CREDENTIAL_ID_REGEX, {
    error: "Credential ID must be lowercase kebab-case",
  }),
  credentialMaintenanceEntrySchema,
);

export type CredentialMaintenanceEntry = z.infer<
  typeof credentialMaintenanceEntrySchema
>;

export interface CredentialExpiryStatus {
  daysLeft: number;
  expired: boolean;
  expiringSoon: boolean;
  expiryDate: Date;
  warningDate: Date;
}

export const WEB_APP_CONFIG_SLUG = "ai-matrx";
export const APPLE_SIGN_IN_CREDENTIAL_ID = "apple-sign-in";

export function credentialMaintenancePath(
  credentialId: string,
  app = WEB_APP_CONFIG_SLUG,
): string {
  const params = new URLSearchParams({ app, credential: credentialId });
  return `/administration/applications/configuration?${params.toString()}`;
}

export function getCredentialExpiryStatus(
  entry: CredentialMaintenanceEntry,
  now = new Date(),
): CredentialExpiryStatus {
  const expiryDate = new Date(entry.expires_at);
  const warningDate = new Date(expiryDate);
  warningDate.setUTCDate(warningDate.getUTCDate() - entry.warning_days);
  const diffMs = expiryDate.getTime() - now.getTime();

  return {
    daysLeft: Math.ceil(diffMs / (1000 * 60 * 60 * 24)),
    expired: now >= expiryDate,
    expiringSoon: now >= warningDate,
    expiryDate,
    warningDate,
  };
}

export function getCredentialExpiryMessage(
  entry: CredentialMaintenanceEntry,
  now = new Date(),
): string {
  const status = getCredentialExpiryStatus(entry, now);
  const formattedDate = status.expiryDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  if (status.expired) {
    return `${entry.label} credential EXPIRED on ${formattedDate}. Authentication may be broken for users. Rotate it in the provider consoles, then record the new expiry in Administration.`;
  }

  return `${entry.label} credential expires on ${formattedDate} (${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} remaining). Rotate it in the provider consoles, then record the new expiry in Administration.`;
}

export function recordCredentialRotation(
  entry: CredentialMaintenanceEntry,
  generatedAt = new Date(),
): CredentialMaintenanceEntry {
  const expiresAt = new Date(generatedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + entry.validity_days);

  return {
    ...entry,
    generated_at: generatedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
  };
}

export function parseCredentialMaintenanceMap(
  config: unknown,
): ReturnType<typeof credentialMaintenanceMapSchema.safeParse> {
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return credentialMaintenanceMapSchema.safeParse(undefined);
  }

  return credentialMaintenanceMapSchema.safeParse(
    (config as Record<string, unknown>).credential_maintenance,
  );
}
