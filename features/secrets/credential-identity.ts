/**
 * Credential identity — what a vault item IS, at a glance.
 *
 * A password manager's list is only scannable when a website login, an API
 * key, and an environment value read as three different things before you
 * finish the word. This module is the ONE place that decides the icon, the
 * accent, the human type label, and which field is the credential's primary
 * pair — so the list card, the detail panel, and any future surface can never
 * disagree about what an item is.
 *
 * Pure and React-free on purpose: it takes normalized `VaultItem` /
 * `CredentialDefinition` data and returns descriptors. It reads NO values and
 * cannot reveal anything — identity is metadata, never plaintext.
 */
import {
  BarChart3,
  Braces,
  BrainCircuit,
  Briefcase,
  Cloud,
  CreditCard,
  Database,
  FileSignature,
  GitBranch,
  Globe,
  KeyRound,
  MessageSquare,
  Newspaper,
  Rocket,
  Server,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import {
  ENV_VALUE_DEFINITION_KEY,
  WEBSITE_LOGIN_DEFINITION_KEY,
  type CredentialDefinition,
  type CredentialFamily,
  type VaultField,
  type VaultItem,
} from "./types";

/**
 * The accent palette. Deliberately a CURATED subset of the semantic tokens —
 * `destructive` is excluded because red must keep meaning "danger" and never
 * decorate a random credential. Every value is a token class, never a hex.
 */
export type CredentialAccent =
  "primary" | "info" | "success" | "warning" | "secondary" | "muted";

export const ACCENT_ICON_CLASS: Record<CredentialAccent, string> = {
  primary: "text-primary",
  info: "text-info",
  success: "text-success",
  warning: "text-warning",
  secondary: "text-secondary",
  muted: "text-muted-foreground",
};

/** The tile behind the icon stays neutral (1Password-style) so a list of
 *  twenty credentials reads as one system, not a bag of confetti. */
export const IDENTITY_TILE_CLASS =
  "flex shrink-0 items-center justify-center rounded-md border border-border bg-muted/60";

interface FamilyLook {
  icon: LucideIcon;
  accent: CredentialAccent;
}

const FAMILY_LOOK: Record<CredentialFamily, FamilyLook> = {
  generic: { icon: KeyRound, accent: "muted" },
  ai_providers: { icon: BrainCircuit, accent: "secondary" },
  source_control: { icon: GitBranch, accent: "primary" },
  cloud_infrastructure: { icon: Cloud, accent: "info" },
  databases: { icon: Database, accent: "info" },
  hosting_deployment: { icon: Rocket, accent: "primary" },
  server_network: { icon: Server, accent: "muted" },
  domains_dns_cdn: { icon: Globe, accent: "info" },
  messaging_communications: { icon: MessageSquare, accent: "primary" },
  payments_commerce: { icon: CreditCard, accent: "success" },
  business_platforms: { icon: Briefcase, accent: "muted" },
  analytics_marketing: { icon: BarChart3, accent: "success" },
  cms_content: { icon: Newspaper, accent: "warning" },
  identity_security: { icon: ShieldCheck, accent: "success" },
  automation_integrations: { icon: Workflow, accent: "secondary" },
  signing_files: { icon: FileSignature, accent: "warning" },
};

/** Definition-level overrides — these three ARE the distinction Arman called
 *  out (website login vs API key vs env value), so they beat the family. */
const DEFINITION_LOOK: Record<string, FamilyLook> = {
  [WEBSITE_LOGIN_DEFINITION_KEY]: { icon: Globe, accent: "primary" },
  [ENV_VALUE_DEFINITION_KEY]: { icon: Braces, accent: "muted" },
  visible_config: { icon: Braces, accent: "muted" },
};

/** Words that must not be title-cased into "Api" / "Url" / "Ssh". */
const ACRONYMS = new Set([
  "ai",
  "api",
  "aws",
  "cdn",
  "ci",
  "cd",
  "db",
  "dns",
  "ftp",
  "gcp",
  "http",
  "https",
  "id",
  "ip",
  "jwt",
  "mfa",
  "oauth",
  "otp",
  "pat",
  "s3",
  "smtp",
  "ssh",
  "sso",
  "ssl",
  "tls",
  "totp",
  "ui",
  "uri",
  "url",
  "vpn",
]);

/**
 * `youtube_data_api_key` → `Youtube Data API Key`. Used ONLY as a fallback
 * when the catalog has no label for a definition or field — a raw snake_case
 * key leaking into the UI is what made the old cards read as database rows.
 */
export function humanizeKey(key: string): string {
  return key
    .split(/[_\-.]+/)
    .filter(Boolean)
    .map((word) =>
      ACRONYMS.has(word.toLowerCase())
        ? word.toUpperCase()
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/** Field keys that identify the ACCOUNT rather than protect it. These are the
 *  "username" half of the primary pair a password manager leads with. */
const IDENTITY_FIELD_KEYS = [
  "username",
  "user",
  "email",
  "login",
  "account",
  "account_id",
  "client_id",
  "access_key_id",
  "api_key_id",
];

/** Ordered preference for "the value I actually came here to copy". */
const SECRET_FIELD_PRIORITY = [
  "password",
  "api_key",
  "secret_key",
  "client_secret",
  "secret",
  "token",
  "access_token",
  "private_key",
  "value",
];

function priorityOf(list: string[], fieldKey: string): number {
  const index = list.indexOf(fieldKey);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

export interface CredentialIdentity {
  icon: LucideIcon;
  accent: CredentialAccent;
  iconClass: string;
  /** Human type label — catalog label first, humanized key as the fallback. */
  kindLabel: string;
  /** One line under the name: the account it signs in as, its host, or its
   *  env alias. Null when the name already says everything. */
  subtitle: string | null;
  /** Bare host of the first login URL, when there is one. */
  host: string | null;
  /** The composed second line, with anything that merely echoes the item's
   *  name removed. Null when there is nothing left worth a line. */
  metaLine: string | null;
}

/** Comparison key for "is this just the name again?" — case, spacing, and
 *  separators all stripped, so `YOUTUBE_DATA_API_KEY` and `YouTube Data API`
 *  are recognisably the same string. */
function comparisonKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * True when a candidate line says nothing the item's name has not already
 * said. Repeating the name under the name is what made these read like rows
 * out of a database dump. Short strings are exempt so a genuine two-letter
 * value is never swallowed by a coincidental substring match.
 */
function echoesName(candidate: string, displayName: string): boolean {
  const a = comparisonKey(candidate);
  const b = comparisonKey(displayName);
  if (a.length < 3 || b.length < 3) return a === b;
  return a === b || a.includes(b) || b.includes(a);
}

export function hostOfUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
    return url.host.replace(/^www\./i, "") || null;
  } catch {
    return null;
  }
}

/**
 * The account-identifying field (the "username" of the pair), if the item has
 * one. `visible` handling is the strongest signal the catalog gives us: a
 * field authorized viewers may see is by definition not the secret.
 */
export function identityFieldOf(item: VaultItem): VaultField | null {
  const active = item.fields.filter((f) => f.is_active);
  const named = active
    .filter((f) => IDENTITY_FIELD_KEYS.includes(f.field_key))
    .sort(
      (a, b) =>
        priorityOf(IDENTITY_FIELD_KEYS, a.field_key) -
        priorityOf(IDENTITY_FIELD_KEYS, b.field_key),
    );
  if (named.length > 0) return named[0] ?? null;
  return active.find((f) => f.handling === "visible") ?? null;
}

/**
 * The field the user came to copy. Never a `visible` identity field when a
 * real secret exists, so "copy the password" never quietly copies a username.
 */
export function primarySecretFieldOf(item: VaultItem): VaultField | null {
  const identity = identityFieldOf(item);
  const candidates = item.fields.filter(
    (f) => f.is_active && f.id !== identity?.id,
  );
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort(
    (a, b) =>
      priorityOf(SECRET_FIELD_PRIORITY, a.field_key) -
      priorityOf(SECRET_FIELD_PRIORITY, b.field_key),
  );
  return sorted[0] ?? null;
}

/** The human label for one field: catalog label, then env alias, then key. */
export function fieldLabelOf(
  field: VaultField,
  catalogLabel: string | null | undefined,
): string {
  if (catalogLabel) return catalogLabel;
  return humanizeKey(field.field_key);
}

/**
 * Show the env alias as a separate chip ONLY when it says something the label
 * does not. `youtube_data_api_key` + `YOUTUBE_DATA_API_KEY` rendered as two
 * chips side by side was pure visual noise.
 */
export function envAliasIsRedundant(field: VaultField): boolean {
  if (!field.env_key) return true;
  return field.env_key.toLowerCase() === field.field_key.toLowerCase();
}

export function credentialIdentity(
  item: VaultItem,
  definition: CredentialDefinition | undefined,
): CredentialIdentity {
  const look =
    DEFINITION_LOOK[item.definition_key] ??
    (definition ? FAMILY_LOOK[definition.payload.family] : undefined) ??
    FAMILY_LOOK.generic;

  const kindLabel =
    definition?.payload.label ?? humanizeKey(item.definition_key);
  const firstUrl = item.login_urls[0];
  const host = firstUrl ? hostOfUrl(firstUrl) : null;
  const identityField = identityFieldOf(item);

  // Priority: who it signs in as > where it signs in > what it is called in a
  // container. The name is already on the line above, so never repeat it.
  const subtitleCandidates = [
    identityField?.handling === "visible" ? identityField.value_hint : null,
    host,
    item.fields.find((f) => f.env_key)?.env_key ?? null,
    item.description,
  ];
  const subtitle =
    subtitleCandidates.find(
      (candidate) =>
        typeof candidate === "string" &&
        candidate.trim().length > 0 &&
        candidate.trim().toLowerCase() !==
          item.display_name.trim().toLowerCase(),
    ) ?? null;
  const metaLine =
    subtitle && !echoesName(subtitle, item.display_name)
      ? subtitle.trim()
      : null;

  return {
    icon: look.icon,
    accent: look.accent,
    iconClass: ACCENT_ICON_CLASS[look.accent],
    kindLabel,
    subtitle: metaLine,
    host,
    metaLine,
  };
}
