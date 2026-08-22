"use client";

/**
 * VaultCreateDialog — catalog picker (family-grouped, searchable, with a
 * "Custom" builder) + definition-driven create form. Field labels,
 * placeholders, validation, env aliases, and handling/editable/inject
 * defaults all come from the `credential_definition` catalog payload —
 * adding a provider changes catalog data, not this component.
 *
 * Two axes on top of that:
 *
 * 1. **Storage class.** A definition field declaring `storage_class:
 *    "metadata"` is NOT encrypted — it writes item metadata instead of a
 *    `fields[]` entry. The reserved keys `login_urls` / `notes` map to
 *    first-class columns; every other metadata field lands in
 *    `non_secret_fields`. Everything plaintext renders inside one visually
 *    separate "Not encrypted" section (twin of `VaultItemDetail`'s).
 * 2. **Who owns it.** "For me / my organization" creates under the viewed
 *    principal (`onCreate`); "For someone else" assigns a personal item to a
 *    recipient resolved SERVER-SIDE by exact email (`onAssign`), optionally
 *    with a server-generated password the creator never sees.
 */
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
  FileKey2,
  Globe,
  KeyRound,
  Loader2,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserPlus,
  Wrench,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { QrCodeInput } from "@/components/qr/QrCodeInput";
import { sanitizeFieldName } from "@/utils/user-table-utls/field-name-sanitizer";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza-modal/credenza";

import {
  generateVaultPassword,
  normalizeVaultLoginUrlInput,
  parseEnvAssignment,
} from "../utils";
import {
  InvalidEnrollmentInputError,
  parseEnrollmentInput,
} from "../authenticator-otpauth";
import { enrollAuthenticator } from "../authenticator-service";
import { checkVaultDestination } from "../vault-service";
import { toast } from "@/lib/toast";
import { recommendedHandlingForFieldKey } from "../credential-identity";
import { VaultHandlingControl } from "./VaultHandlingControl";
import {
  ENV_VALUE_DEFINITION_KEY,
  FAMILY_LABELS,
  FIELD_KEY_RE,
  HANDLING_LABELS,
  URI_MATCH_MODE_LABELS,
  VALID_KEY_RE,
  VAULT_LABELS,
  WEBSITE_LOGIN_DEFINITION_KEY,
  effectiveFields,
  normalizeVaultHandling,
  toPrincipalIn,
  type CredentialDefinition,
  type CredentialFamily,
  type CredentialFieldDef,
  type NonSecretField,
  type UriMatchMode,
  type VaultAssignRequest,
  type VaultAssignResponse,
  type VaultFieldIn,
  type VaultHandling,
  type VaultItem,
  type VaultItemCreateRequest,
  type VaultPrincipal,
} from "../types";

type DestinationFeedback = {
  tone: "checking" | "success" | "warning" | "error";
  message: string;
};

interface VaultCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  principal: VaultPrincipal;
  definitions: CredentialDefinition[];
  busy: boolean;
  onCreate: (
    body: VaultItemCreateRequest,
    attachments?: {
      file: File;
      label: string;
      description?: string;
      handling: string;
    }[],
  ) => Promise<VaultItem>;
  onAssign: (body: VaultAssignRequest) => Promise<VaultAssignResponse>;
  /** Opens directly in one canonical definition form. Authenticator uses this
   *  for Website login instead of maintaining a second create UI. */
  initialDefinitionKey?: string;
  /** Fires after all optional follow-up work, including TOTP enrollment. */
  onSaved?: (item: VaultItem) => void | Promise<void>;
}

type Step =
  | { kind: "pick" }
  | { kind: "form"; definition: CredentialDefinition }
  | { kind: "custom" };

/** Who ends up owning the credential. */
type CreateMode = "self" | "assign";

/** Where the assigned item's password comes from. */
type PasswordMode = "provided" | "generate";

/** The 2FA half of the website-login recipe. `totp` = we hold the seed and
 * sign in fully automatically; `sms`/`other` = recorded as a KNOWN handback
 * point (Matrx returns control to the person at the verification step). */
type TwoFactorChoice = "off" | "totp" | "sms" | "other";

const TWO_FACTOR_LABELS: Record<TwoFactorChoice, string> = {
  off: "Not used on this account",
  totp: "Authenticator app — Matrx signs in fully automatically",
  sms: "Text message (SMS) — you help at the verification step",
  other: "Push notification / other — you help at the verification step",
};

/** The one field the server may generate. Its value never reaches this
 *  browser — the request omits it from `fields[]` entirely. */
const GENERATED_FIELD_KEY = "password";

/** Metadata field keys that map to first-class item columns; every other
 *  metadata field is written into `non_secret_fields`. */
const RESERVED_METADATA_KEYS: readonly string[] = ["login_urls", "notes"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BASIC_PURPOSE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  [WEBSITE_LOGIN_DEFINITION_KEY]:
    "Save a website, username or email, and password for manual use or secure browser filling.",
  api_key: "Save one API key or access token for a service.",
  [ENV_VALUE_DEFINITION_KEY]:
    "Save a named value that workflows or sandboxes can use.",
  secure_file:
    "Encrypt a credential file such as a signing key, certificate, or recovery export.",
};

function purposeDescription(definition: CredentialDefinition): string | null {
  return (
    BASIC_PURPOSE_DESCRIPTIONS[definition.key] ??
    definition.payload.description ??
    null
  );
}

function isMetadataField(def: CredentialFieldDef): boolean {
  return def.storage_class === "metadata";
}

export function VaultCreateDialog({
  open,
  onOpenChange,
  principal,
  definitions,
  busy,
  onCreate,
  onAssign,
  initialDefinitionKey,
  onSaved,
}: VaultCreateDialogProps) {
  const initialDefinition = initialDefinitionKey
    ? definitions.find((definition) => definition.key === initialDefinitionKey)
    : undefined;
  const initialStep = (): Step =>
    initialDefinition
      ? { kind: "form", definition: initialDefinition }
      : { kind: "pick" };
  const [step, setStep] = useState<Step>(initialStep);
  const [mode, setMode] = useState<CreateMode>("self");
  const [assigned, setAssigned] = useState<VaultAssignResponse | null>(null);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setStep(initialStep());
      setMode("self");
      setAssigned(null);
    }
  };

  const submitCreate = async (
    body: VaultItemCreateRequest,
    attachments?: {
      file: File;
      label: string;
      description?: string;
      handling: string;
    }[],
  ) => {
    const created = await onCreate(body, attachments);
    close(false);
    return created;
  };

  const submitAssign = async (body: VaultAssignRequest) => {
    setAssigned(await onAssign(body));
  };

  return (
    <Credenza open={open} onOpenChange={close}>
      <CredenzaContent className="md:max-w-2xl">
        <CredenzaHeader>
          <CredenzaTitle className="flex items-center gap-2">
            {step.kind !== "pick" && !assigned && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setStep({ kind: "pick" })}
                aria-label="Back to catalog"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {assigned
              ? "Created for someone"
              : step.kind === "pick"
                ? "New credential"
                : step.kind === "custom"
                  ? "Custom credential"
                  : (step.definition.payload.label ?? step.definition.key)}
          </CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="max-h-[70dvh] overflow-y-auto pb-6">
          {assigned ? (
            <AssignConfirmation
              result={assigned}
              onDone={() => close(false)}
              onAnother={() => {
                setAssigned(null);
                setStep({ kind: "pick" });
              }}
            />
          ) : (
            <div className="space-y-3">
              {!(
                step.kind === "form" &&
                step.definition.payload.attachment_only === true
              ) && <ModeToggle mode={mode} onChange={setMode} />}

              {step.kind === "pick" && (
                <DefinitionPicker
                  definitions={definitions}
                  onPick={(definition) => {
                    if (definition.payload.attachment_only === true) {
                      setMode("self");
                    }
                    setStep({ kind: "form", definition });
                  }}
                  onCustom={() => setStep({ kind: "custom" })}
                />
              )}
              {step.kind === "form" && (
                <DefinitionForm
                  definition={step.definition}
                  definitions={definitions}
                  principal={principal}
                  mode={mode}
                  busy={busy}
                  onCreate={submitCreate}
                  onAssign={submitAssign}
                  onSaved={onSaved}
                />
              )}
              {step.kind === "custom" && (
                <CustomBuilder
                  principal={principal}
                  mode={mode}
                  busy={busy}
                  onCreate={submitCreate}
                  onAssign={submitAssign}
                />
              )}
            </div>
          )}
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}

// ── Ownership mode ────────────────────────────────────────────────────────

function ModeToggle({
  mode,
  onChange,
}: {
  mode: CreateMode;
  onChange: (mode: CreateMode) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 rounded-md border border-border bg-muted/40 p-0.5"
      role="group"
      aria-label="Who this credential is for"
    >
      {(["self", "assign"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onChange(value)}
          className={cn(
            "flex-1 rounded px-2.5 py-1.5 text-xs font-medium transition-colors",
            mode === value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {value === "self" ? "For me / my organization" : "For someone else"}
        </button>
      ))}
    </div>
  );
}

/**
 * Recipient + password-source panel. The recipient is an EXACT email the
 * server resolves — no directory search, no autocomplete. "Generate
 * privately" hands password creation to the server; the creator is told
 * plainly that they will never see the value.
 */
function RecipientPanel({
  email,
  onEmailChange,
  passwordMode,
  onPasswordModeChange,
  canGenerate,
}: {
  email: string;
  onEmailChange: (next: string) => void;
  passwordMode: PasswordMode;
  onPasswordModeChange: (next: PasswordMode) => void;
  canGenerate: boolean;
}) {
  const trimmed = email.trim();
  return (
    <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <UserPlus className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold">Create for someone else</p>
      </div>
      <p className="text-xs text-muted-foreground">
        The credential is created in the recipient&apos;s personal vault and
        they own it immediately — it is never owned by an organization.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="vault-recipient-email">Recipient email</Label>
        <Input
          id="vault-recipient-email"
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="person@example.com"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={Boolean(trimmed) && !EMAIL_RE.test(trimmed)}
        />
        <p className="text-xs text-muted-foreground">
          Enter the exact address of an existing Matrx account. Matrx resolves
          it on the server — there is no directory search.
        </p>
      </div>

      {canGenerate && (
        <div className="space-y-1.5">
          <Label>Password</Label>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <Button
              type="button"
              size="sm"
              variant={passwordMode === "provided" ? "default" : "outline"}
              onClick={() => onPasswordModeChange("provided")}
              aria-pressed={passwordMode === "provided"}
            >
              Provided by me
            </Button>
            <Button
              type="button"
              size="sm"
              variant={passwordMode === "generate" ? "default" : "outline"}
              onClick={() => onPasswordModeChange("generate")}
              aria-pressed={passwordMode === "generate"}
            >
              Generate privately
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {passwordMode === "provided"
              ? "You type the password, so you will know it. Matrx cannot make you forget a value you entered."
              : "Matrx generates the password on the server and stores it on the recipient's item. It is never shown to you and never sent to this browser — only the recipient can reveal it."}
          </p>
        </div>
      )}
    </div>
  );
}

/** Safe confirmation ONLY — a generated password never appears here. */
function AssignConfirmation({
  result,
  onDone,
  onAnother,
}: {
  result: VaultAssignResponse;
  onDone: () => void;
  onAnother: () => void;
}) {
  const recipient =
    result.assigned_to?.email ?? result.assigned_to?.user_id ?? "the recipient";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">Created for {recipient}</p>
      </div>

      <dl className="space-y-1 rounded-md border border-border bg-card p-3 text-xs">
        <div className="flex items-baseline gap-2">
          <dt className="w-28 shrink-0 text-muted-foreground">
            {VAULT_LABELS.credentialName}
          </dt>
          <dd className="min-w-0 flex-1 whitespace-normal break-words">
            {result.display_name}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-28 shrink-0 text-muted-foreground">
            {VAULT_LABELS.credentialType}
          </dt>
          <dd className="min-w-0 flex-1 whitespace-normal break-all font-mono">
            {result.definition_key}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-28 shrink-0 text-muted-foreground">Credential ID</dt>
          <dd className="min-w-0 flex-1 whitespace-normal break-all font-mono">
            {result.id}
          </dd>
        </div>
      </dl>

      {result.generated ? (
        <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold">
              Password generated privately
            </p>
            <Badge
              variant="outline"
              className="border-amber-500/40 text-[10px]"
            >
              Not shown to you
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Matrx generated the password on the server and stored it on{" "}
            {recipient}&apos;s item. It was never sent to this browser, so there
            is nothing here to copy — only the recipient can reveal it.
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          The recipient owns this credential now and sees it under their own
          vault. You keep no access to it.
        </p>
      )}

      <div className="flex justify-end gap-1.5">
        <Button variant="outline" size="sm" onClick={onAnother}>
          <Plus className="mr-2 h-4 w-4" />
          Create another
        </Button>
        <Button size="sm" onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

// ── Step 1: catalog picker ────────────────────────────────────────────────

function DefinitionPicker({
  definitions,
  onPick,
  onCustom,
}: {
  definitions: CredentialDefinition[];
  onPick: (definition: CredentialDefinition) => void;
  onCustom: () => void;
}) {
  const [query, setQuery] = useState("");
  const [showCatalog, setShowCatalog] = useState(false);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = definitions.filter((def) => {
      if (!q) return true;
      const hay = [
        def.key,
        def.payload.label,
        def.payload.description ?? "",
        def.payload.provider_key ?? "",
        ...(def.payload.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    const byFamily = new Map<CredentialFamily, CredentialDefinition[]>();
    for (const def of matches) {
      const list = byFamily.get(def.payload.family) ?? [];
      list.push(def);
      byFamily.set(def.payload.family, list);
    }
    return [...byFamily.entries()].sort(([a], [b]) =>
      FAMILY_LABELS[a].localeCompare(FAMILY_LABELS[b]),
    );
  }, [definitions, query]);

  const quickDefinitions = [
    WEBSITE_LOGIN_DEFINITION_KEY,
    "api_key",
    ENV_VALUE_DEFINITION_KEY,
    "secure_file",
  ]
    .map((key) => definitions.find((definition) => definition.key === key))
    .filter((definition): definition is CredentialDefinition =>
      Boolean(definition),
    );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">What are you saving?</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Choose the purpose first. Matrx will show the correct labeled fields
          for that credential.
        </p>
      </div>

      {!showCatalog ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {quickDefinitions.map((definition) => (
              <DefinitionButton
                key={definition.key}
                definition={definition}
                onPick={() => onPick(definition)}
              />
            ))}
            <button
              type="button"
              onClick={onCustom}
              className="min-w-0 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
            >
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 shrink-0 text-primary" />
                <p className="whitespace-normal break-words text-sm font-medium">
                  Custom credential
                </p>
              </div>
              <p className="mt-1 whitespace-normal break-words text-xs text-muted-foreground">
                Build a labeled group of values when none of the common purposes
                fit.
              </p>
            </button>
          </div>

          {definitions.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
              The credential catalog is empty or still loading. You can still
              create a custom credential.
            </p>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => setShowCatalog(true)}
            >
              Browse all {definitions.length} credential types
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search credential types"
                className="pl-8"
                aria-label="Search credential types"
              />
            </div>
            <Button variant="outline" size="sm" onClick={onCustom}>
              <Wrench className="mr-2 h-4 w-4" />
              Custom
            </Button>
          </div>

          {grouped.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No credential type matches “{query}”. Use Custom instead.
            </p>
          ) : (
            <div className="space-y-4">
              {grouped.map(([family, defs]) => (
                <div key={family}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {FAMILY_LABELS[family]}
                  </p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {defs.map((definition) => (
                      <DefinitionButton
                        key={definition.key}
                        definition={definition}
                        onPick={() => onPick(definition)}
                        showPreset
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DefinitionButton({
  definition,
  onPick,
  showPreset = false,
}: {
  definition: CredentialDefinition;
  onPick: () => void;
  showPreset?: boolean;
}) {
  const Icon =
    definition.key === WEBSITE_LOGIN_DEFINITION_KEY ? Globe : KeyRound;
  const description = purposeDescription(definition);

  return (
    <button
      type="button"
      onClick={onPick}
      className="min-w-0 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 whitespace-normal break-words text-sm font-medium">
          {definition.payload.label}
        </p>
        {showPreset && definition.payload.provider_key && (
          <Badge variant="outline" className="shrink-0 font-normal">
            preset
          </Badge>
        )}
      </div>
      {description && (
        <p className="mt-1 whitespace-normal break-words text-xs text-muted-foreground">
          {description}
        </p>
      )}
    </button>
  );
}

// ── Step 2: definition-driven form ────────────────────────────────────────

interface FieldDraft {
  def: CredentialFieldDef;
  value: string;
  envKey: string;
  inject: boolean;
}

interface AttachmentDraft {
  file: File | null;
  label: string;
  description: string;
  handling: VaultHandling;
}

const emptyAttachmentDraft = (): AttachmentDraft => ({
  file: null,
  label: "",
  description: "",
  handling: "revealable",
});

function FieldRuntimeSettings({
  draft,
  onChange,
  placeholder,
}: {
  draft: FieldDraft;
  onChange: (patch: Partial<FieldDraft>) => void;
  placeholder: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex min-w-0 flex-1 basis-48 items-center gap-2">
        <Label
          htmlFor={`vault-env-${draft.def.field_key}`}
          className="shrink-0 text-xs text-muted-foreground"
        >
          {VAULT_LABELS.runtimeKey}
        </Label>
        <Input
          id={`vault-env-${draft.def.field_key}`}
          value={draft.envKey}
          onChange={(event) => onChange({ envKey: event.target.value })}
          placeholder={placeholder}
          className="h-8 font-mono text-xs"
          aria-invalid={
            Boolean(draft.envKey) && !VALID_KEY_RE.test(draft.envKey)
          }
        />
      </div>
      <p className="basis-full text-[11px] text-muted-foreground">
        Workflows and sandboxes use the runtime key to reference this value by
        name.
      </p>
      <label
        className="flex items-center gap-2 text-xs text-muted-foreground"
        title={
          draft.envKey
            ? undefined
            : "Name the runtime key first — a sandbox variable needs a name."
        }
      >
        {VAULT_LABELS.sandboxAccess}
        <Switch
          checked={draft.inject && Boolean(draft.envKey)}
          disabled={!draft.envKey}
          onCheckedChange={(checked) => onChange({ inject: checked })}
          aria-label={`Inject ${draft.def.label} into sandboxes`}
        />
      </label>
    </div>
  );
}

function DefinitionForm({
  definition,
  definitions,
  principal,
  mode,
  busy,
  onCreate,
  onAssign,
  onSaved,
}: {
  definition: CredentialDefinition;
  definitions: CredentialDefinition[];
  principal: VaultPrincipal;
  mode: CreateMode;
  busy: boolean;
  onCreate: (
    body: VaultItemCreateRequest,
    attachments?: {
      file: File;
      label: string;
      description?: string;
      handling: string;
    }[],
  ) => Promise<VaultItem>;
  onAssign: (body: VaultAssignRequest) => Promise<void>;
  onSaved?: (item: VaultItem) => void | Promise<void>;
}) {
  const byKey = useMemo(
    () => new Map(definitions.map((d) => [d.key, d])),
    [definitions],
  );
  const fieldDefs = useMemo(
    () => effectiveFields(definition, byKey),
    [definition, byKey],
  );

  // Storage class splits the definition: `metadata` fields write plaintext
  // item metadata, everything else writes an encrypted `fields[]` entry.
  const metadataDefs = fieldDefs.filter(isMetadataField);
  const encryptedDefs = fieldDefs.filter((def) => !isMetadataField(def));
  const isWebsiteLogin =
    definition.key === WEBSITE_LOGIN_DEFINITION_KEY ||
    definition.payload.base_definition_key === WEBSITE_LOGIN_DEFINITION_KEY;
  const loginUrlDef = metadataDefs.find((d) => d.field_key === "login_urls");
  const notesDef = metadataDefs.find((d) => d.field_key === "notes");
  const extraMetaDefs = metadataDefs.filter(
    (d) => !RESERVED_METADATA_KEYS.includes(d.field_key),
  );
  const showDestination = Boolean(loginUrlDef) || isWebsiteLogin;
  const showNotes = Boolean(notesDef) || isWebsiteLogin;
  const showNotEncrypted = showNotes || extraMetaDefs.length > 0;
  const attachmentOnly = definition.payload.attachment_only === true;

  const [displayName, setDisplayName] = useState(definition.payload.label);
  const [description, setDescription] = useState("");
  const [drafts, setDrafts] = useState<FieldDraft[]>(() =>
    encryptedDefs.map((def) => ({
      def,
      value: "",
      envKey: def.env_aliases?.[0] ?? "",
      inject: def.inject_into_sandbox ?? false,
    })),
  );
  const [loginUrls, setLoginUrls] = useState<string[]>(() =>
    showDestination ? [""] : [],
  );
  const [destinationFeedback, setDestinationFeedback] = useState<
    Record<number, DestinationFeedback>
  >({});
  const destinationCheckSequence = useRef<Record<number, number>>({});
  const [uriMatchMode, setUriMatchMode] = useState<UriMatchMode>("host");
  const [browserFill, setBrowserFill] = useState(true);
  // Two-factor is part of the ONE create recipe for a website login (Arman
  // 2026-08-21): username + password + 2FA choice captured together. An
  // authenticator seed enrolls on THIS item right after create; a non-app
  // method is recorded so agents know to hand control back at verification.
  const [twoFactor, setTwoFactor] = useState<TwoFactorChoice>("off");
  const [totpInput, setTotpInput] = useState("");
  const [totpDecodeError, setTotpDecodeError] = useState<string | null>(null);
  const [secureNotes, setSecureNotes] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState("");
  const [showSecureNotes, setShowSecureNotes] = useState(false);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [supplementalAttachments, setSupplementalAttachments] = useState<
    AttachmentDraft[]
  >([]);
  const [notes, setNotes] = useState("");
  const [metaValues, setMetaValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(extraMetaDefs.map((d) => [d.field_key, ""])),
  );
  const [recipientEmail, setRecipientEmail] = useState("");
  const [passwordMode, setPasswordMode] = useState<PasswordMode>("provided");
  const [shownFieldKeys, setShownFieldKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentLabel, setAttachmentLabel] = useState("");
  const [attachmentPurpose, setAttachmentPurpose] = useState("");
  const [attachmentHandling, setAttachmentHandling] =
    useState<VaultHandling>("revealable");

  const setDraft = (index: number, patch: Partial<FieldDraft>) =>
    setDrafts((current) =>
      current.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );

  const normalizeAndCheckDestination = async (index: number, value: string) => {
    const sequence = (destinationCheckSequence.current[index] ?? 0) + 1;
    destinationCheckSequence.current[index] = sequence;
    if (!value.trim()) {
      setDestinationFeedback((current) => {
        const next = { ...current };
        delete next[index];
        return next;
      });
      return;
    }

    const normalized = normalizeVaultLoginUrlInput(value);
    if (!normalized) {
      setDestinationFeedback((current) => ({
        ...current,
        [index]: {
          tone: "error",
          message: "Enter a website such as npmjs.com.",
        },
      }));
      return;
    }

    setLoginUrls((current) =>
      current.map((url, currentIndex) =>
        currentIndex === index ? normalized : url,
      ),
    );
    setDestinationFeedback((current) => ({
      ...current,
      [index]: { tone: "checking", message: "Checking website…" },
    }));

    try {
      const result = await checkVaultDestination(normalized);
      if (destinationCheckSequence.current[index] !== sequence) return;
      const feedback: DestinationFeedback =
        result.state === "reachable"
          ? { tone: "success", message: "Website confirmed." }
          : result.state === "not_found"
            ? {
                tone: "warning",
                message: "Website responded, but this page was not found.",
              }
            : result.state === "responded"
              ? {
                  tone: "warning",
                  message: `Website responded with status ${result.http_status ?? "unknown"}.`,
                }
              : result.state === "invalid"
                ? {
                    tone: "error",
                    message: "This is not a valid public website.",
                  }
                : {
                    tone: "warning",
                    message:
                      "Could not reach this website. You can still save.",
                  };
      setDestinationFeedback((current) => ({ ...current, [index]: feedback }));
    } catch {
      if (destinationCheckSequence.current[index] !== sequence) return;
      setDestinationFeedback((current) => ({
        ...current,
        [index]: {
          tone: "warning",
          message: "Could not verify right now. You can still save.",
        },
      }));
    }
  };

  const enteredUrls = loginUrls.map((url) => url.trim()).filter(Boolean);
  const urls = enteredUrls.flatMap((url) => {
    const normalized = normalizeVaultLoginUrlInput(url);
    return normalized ? [normalized] : [];
  });
  const assigning = mode === "assign";
  const canGenerate = drafts.some(
    (d) => d.def.field_key === GENERATED_FIELD_KEY,
  );
  const generating = assigning && canGenerate && passwordMode === "generate";
  const isGeneratedField = (fieldKey: string) =>
    generating && fieldKey === GENERATED_FIELD_KEY;

  const problems: string[] = [];
  if (!displayName.trim()) problems.push("A name is required.");
  if (assigning) {
    const email = recipientEmail.trim();
    if (!email) problems.push("A recipient email is required.");
    else if (!EMAIL_RE.test(email))
      problems.push("Enter the recipient's full email address.");
  }
  if (attachmentOnly && assigning) {
    problems.push(
      "Create protected files in your own vault first, then give ownership if needed.",
    );
  }
  if (attachmentOnly && !attachmentFile) problems.push("Choose a file.");
  if (
    isWebsiteLogin &&
    !assigning &&
    twoFactor === "totp" &&
    totpInput.trim()
  ) {
    try {
      parseEnrollmentInput(totpInput);
    } catch (err) {
      problems.push(
        err instanceof InvalidEnrollmentInputError
          ? err.message
          : "That authenticator setup key could not be read.",
      );
    }
  }
  if (attachmentOnly && !attachmentLabel.trim())
    problems.push("A file label is required.");
  supplementalAttachments.forEach((attachment, index) => {
    if (!attachment.file)
      problems.push(`Protected file ${index + 1}: choose a file.`);
    if (!attachment.label.trim())
      problems.push(`Protected file ${index + 1}: add a label.`);
  });
  for (const draft of drafts) {
    if (isGeneratedField(draft.def.field_key)) continue;
    const label = draft.def.label;
    if ((draft.def.required ?? true) && !draft.value && !isWebsiteLogin) {
      problems.push(`${label} is required.`);
    }
    if (draft.value && draft.def.validation_regex) {
      try {
        if (!new RegExp(draft.def.validation_regex).test(draft.value)) {
          problems.push(`${label} does not match the expected format.`);
        }
      } catch {
        // A broken regex in catalog data must not block saving.
      }
    }
    if (draft.envKey && !VALID_KEY_RE.test(draft.envKey)) {
      problems.push(`${label}: environment key must be a valid identifier.`);
    }
    // A sandbox variable needs a NAME. The server refuses inject-without-alias
    // outright (it could never take effect); say so here rather than letting
    // the save fail. Catalog definitions like `env_value` ship inject=true with
    // no default alias, so this is the normal prompt, not an edge case.
    if (draft.inject && !draft.envKey) {
      problems.push(`${label}: sandbox injection needs an environment key.`);
    }
  }
  if (
    loginUrlDef &&
    (loginUrlDef.required ?? true) &&
    urls.length === 0 &&
    !isWebsiteLogin
  ) {
    problems.push(`${loginUrlDef.label} is required.`);
  }
  if (enteredUrls.length !== urls.length) {
    problems.push("Enter a valid HTTP or HTTPS login address.");
  }
  const hasAnyValue =
    drafts.some((d) => d.value) ||
    urls.length > 0 ||
    Boolean(notes.trim()) ||
    Boolean(secureNotes.trim()) ||
    Boolean(recoveryCodes.trim()) ||
    supplementalAttachments.length > 0 ||
    Object.values(metaValues).some((v) => v.trim());
  if (!hasAnyValue && !generating && !attachmentOnly) {
    problems.push("Enter at least one value.");
  }

  const buildFields = (): VaultFieldIn[] => {
    const fields: VaultFieldIn[] = drafts
      .filter((d) => d.value && !isGeneratedField(d.def.field_key))
      .map((d) => ({
        field_key: d.def.field_key,
        value: d.value,
        env_key: d.envKey || null,
        handling: normalizeVaultHandling(d.def.handling),
        editable: d.def.editable ?? true,
        inject_into_sandbox: d.inject && Boolean(d.envKey),
        description: d.def.description ?? null,
      }));
    if (secureNotes.trim()) {
      fields.push({
        field_key: "secure_notes",
        value: secureNotes.trim(),
        handling: "revealable",
        editable: true,
        inject_into_sandbox: false,
        description: "Encrypted notes",
      });
    }
    if (recoveryCodes.trim()) {
      fields.push({
        field_key: "recovery_codes",
        value: recoveryCodes.trim(),
        handling: "revealable",
        editable: true,
        inject_into_sandbox: false,
        description: "One-time account recovery codes",
      });
    }
    return fields;
  };

  /** Plaintext item metadata — never `fields[]`. */
  const buildMetadata = () => {
    if (!showDestination && !showNotEncrypted) return {};
    const extras: NonSecretField[] = extraMetaDefs
      .map((d) => ({
        key: d.field_key,
        label: d.label,
        value: (metaValues[d.field_key] ?? "").trim(),
      }))
      .filter((entry) => entry.value.length > 0);
    // A non-app 2FA method is plaintext account knowledge: agents read it and
    // KNOW to hand control back at the verification step instead of failing.
    // (The authenticator-app case writes nothing here — enrollment stamps the
    // server-owned totp_* metadata on this same item.)
    if (
      isWebsiteLogin &&
      !assigning &&
      (twoFactor === "sms" || twoFactor === "other")
    ) {
      extras.push({
        key: "mfa_method",
        label: "Two-factor method",
        value: twoFactor === "sms" ? "sms" : "push_or_other",
      });
    }
    return {
      login_urls: urls.length > 0 ? urls : null,
      uri_match_mode: urls.length > 0 ? uriMatchMode : null,
      notes: notes.trim() || null,
      non_secret_fields: extras.length > 0 ? extras : null,
      browser_fill_enabled: urls.length > 0 ? browserFill : null,
    };
  };

  const submit = async () => {
    if (problems.length > 0) return;
    const baseKey = definition.payload.base_definition_key;
    const definitionKey = baseKey ?? definition.key;
    const providerKey =
      definition.payload.provider_key ?? (baseKey ? definition.key : null);

    if (assigning) {
      await onAssign({
        recipient_email: recipientEmail.trim(),
        display_name: displayName.trim(),
        description: description.trim() || null,
        definition_key: definitionKey,
        definition_version: 1,
        provider_key: providerKey,
        fields: buildFields(),
        generate_field_key: generating ? GENERATED_FIELD_KEY : null,
        ...buildMetadata(),
      });
      return;
    }

    const created = await onCreate(
      {
        principal: toPrincipalIn(principal),
        display_name: displayName.trim(),
        description: description.trim() || null,
        definition_key: definitionKey,
        definition_version: 1,
        provider_key: providerKey,
        fields: buildFields(),
        source: "manual",
        ...buildMetadata(),
      },
      [
        ...(attachmentOnly && attachmentFile
          ? [
              {
                file: attachmentFile,
                label: attachmentLabel.trim(),
                description: attachmentPurpose.trim() || undefined,
                handling: attachmentHandling,
              },
            ]
          : []),
        ...supplementalAttachments.flatMap((attachment) =>
          attachment.file
            ? [
                {
                  file: attachment.file,
                  label: attachment.label.trim(),
                  description: attachment.description.trim() || undefined,
                  handling: attachment.handling,
                },
              ]
            : [],
        ),
      ],
    );
    // The 2FA half of the recipe: the seed enrolls on the SAME item, in the
    // same user action. The login itself was created — an enrollment failure
    // must not roll that back, only tell the person how to finish.
    if (
      isWebsiteLogin &&
      twoFactor === "totp" &&
      totpInput.trim() &&
      created?.id
    ) {
      try {
        await enrollAuthenticator(created.id, totpInput.trim());
        toast.success(
          "Login saved with its authenticator — sign-in is fully automatic.",
        );
      } catch {
        toast.error(
          "The login was saved, but the authenticator could not be enrolled. " +
            "Open the login in your Vault and add the setup key there.",
        );
      }
    }
    await onSaved?.(created);
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {purposeDescription(definition) && (
        <p className="text-xs text-muted-foreground">
          {purposeDescription(definition)}
        </p>
      )}
      {(definition.payload.setup_hints ?? []).length > 0 && (
        <ul className="list-inside list-disc space-y-0.5 rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
          {(definition.payload.setup_hints ?? []).map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      )}

      {attachmentOnly && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div>
            <p className="text-sm font-semibold">Protected file</p>
            <p className="text-xs text-muted-foreground">
              The file bytes are encrypted. Its label and purpose help you
              recognize it later.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`new-secure-file-${definition.key}`}>File</Label>
              <Input
                id={`new-secure-file-${definition.key}`}
                type="file"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  setAttachmentFile(next);
                  if (next && !attachmentLabel) setAttachmentLabel(next.name);
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Maximum 25 MB.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`new-secure-file-label-${definition.key}`}>
                Label
              </Label>
              <Input
                id={`new-secure-file-label-${definition.key}`}
                value={attachmentLabel}
                onChange={(event) => setAttachmentLabel(event.target.value)}
                placeholder="Apple developer signing key"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`new-secure-file-purpose-${definition.key}`}>
                Purpose
              </Label>
              <Input
                id={`new-secure-file-purpose-${definition.key}`}
                value={attachmentPurpose}
                onChange={(event) => setAttachmentPurpose(event.target.value)}
                placeholder="Used to sign App Store Connect API requests"
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Download protection</Label>
              <VaultHandlingControl
                value={attachmentHandling}
                onValueChange={setAttachmentHandling}
                disabled={busy}
              />
              <p className="text-[11px] text-muted-foreground">
                The file is always encrypted at rest.
              </p>
            </div>
          </div>
        </div>
      )}

      {assigning && (
        <RecipientPanel
          email={recipientEmail}
          onEmailChange={setRecipientEmail}
          passwordMode={passwordMode}
          onPasswordModeChange={setPasswordMode}
          canGenerate={canGenerate}
        />
      )}

      <div className="space-y-1.5">
        <Label htmlFor="vault-create-name">{VAULT_LABELS.credentialName}</Label>
        <Input
          id="vault-create-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Production Stripe"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vault-create-description">
          {VAULT_LABELS.description} (optional)
        </Label>
        <Input
          id="vault-create-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What uses this credential?"
        />
      </div>

      {/* Destination — plaintext metadata, the thing the browser matches on */}
      {showDestination && (
        <div className="space-y-2 rounded-md border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Globe className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-semibold">
              {loginUrlDef?.label ?? "Login URL(s)"}
            </p>
            {(isWebsiteLogin || loginUrlDef?.required === false) && (
              <span className="text-xs text-muted-foreground">optional</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {loginUrlDef?.description ??
              "Where this login is used. Stored as plain, unencrypted metadata so Matrx can match the page — never put a secret here."}
          </p>

          {loginUrls.map((url, index) => (
            <div key={index} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Input
                  value={url}
                  onChange={(e) => {
                    destinationCheckSequence.current[index] =
                      (destinationCheckSequence.current[index] ?? 0) + 1;
                    setDestinationFeedback((current) => {
                      const next = { ...current };
                      delete next[index];
                      return next;
                    });
                    setLoginUrls((current) =>
                      current.map((u, i) => (i === index ? e.target.value : u)),
                    );
                  }}
                  onBlur={() => void normalizeAndCheckDestination(index, url)}
                  placeholder={
                    loginUrlDef?.placeholder_example ??
                    "https://example.com/login"
                  }
                  className="h-11 font-mono text-base sm:h-8 sm:text-xs"
                  inputMode="url"
                  autoComplete="off"
                  aria-label={`Login URL ${index + 1}`}
                  aria-invalid={
                    Boolean(url.trim()) &&
                    normalizeVaultLoginUrlInput(url) === null
                  }
                />
                {loginUrls.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => {
                      setLoginUrls((current) =>
                        current.filter((_, i) => i !== index),
                      );
                      setDestinationFeedback({});
                    }}
                    aria-label={`Remove login URL ${index + 1}`}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
              {destinationFeedback[index] && (
                <p
                  className={cn(
                    "flex items-center gap-1.5 text-xs",
                    destinationFeedback[index].tone === "success" &&
                      "text-emerald-600 dark:text-emerald-400",
                    destinationFeedback[index].tone === "error" &&
                      "text-destructive",
                    destinationFeedback[index].tone === "warning" &&
                      "text-amber-700 dark:text-amber-400",
                    destinationFeedback[index].tone === "checking" &&
                      "text-muted-foreground",
                  )}
                  aria-live="polite"
                >
                  {destinationFeedback[index].tone === "checking" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : destinationFeedback[index].tone === "success" ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : null}
                  {destinationFeedback[index].message}
                </p>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => setLoginUrls((current) => [...current, ""])}
          >
            <Plus className="mr-1.5 h-3 w-3" />
            Add URL
          </Button>

          {urls.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">
                  {VAULT_LABELS.browserMatchRule}
                </Label>
                <Select
                  value={uriMatchMode}
                  onValueChange={(next) =>
                    setUriMatchMode(next as UriMatchMode)
                  }
                >
                  <SelectTrigger
                    className="h-7 text-xs"
                    aria-label={VAULT_LABELS.browserMatchRule}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(URI_MATCH_MODE_LABELS) as UriMatchMode[]).map(
                      (matchMode) => (
                        <SelectItem key={matchMode} value={matchMode}>
                          {URI_MATCH_MODE_LABELS[matchMode]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-end gap-2 pb-1">
                <Switch
                  checked={browserFill}
                  onCheckedChange={setBrowserFill}
                  aria-label="Let Matrx fill this login in the browser"
                />
                <span className="text-xs">
                  Let Matrx fill this login in the browser
                </span>
              </label>
            </div>
          )}
        </div>
      )}

      {isWebsiteLogin && !assigning && !attachmentOnly && (
        <div className="space-y-2 rounded-md border border-border p-3">
          <div className="space-y-1">
            <Label className="text-xs">Two-factor authentication</Label>
            <Select
              value={twoFactor}
              onValueChange={(next) => setTwoFactor(next as TwoFactorChoice)}
            >
              <SelectTrigger
                className="h-7 text-xs"
                aria-label="Two-factor authentication"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TWO_FACTOR_LABELS) as TwoFactorChoice[]).map(
                  (choice) => (
                    <SelectItem key={choice} value={choice}>
                      {TWO_FACTOR_LABELS[choice]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          {twoFactor === "totp" && (
            <div className="space-y-2">
              <QrCodeInput
                disabled={busy}
                hint="Paste, drop, choose, or scan the site's QR code. The image is read here and never uploaded."
                onDecoded={(value) => {
                  setTotpDecodeError(null);
                  setTotpInput(value);
                }}
                onError={setTotpDecodeError}
              />
              <Label htmlFor="vault-create-totp" className="text-xs">
                Authenticator setup key (optional)
              </Label>
              <Input
                id="vault-create-totp"
                value={totpInput}
                onChange={(e) => {
                  setTotpDecodeError(null);
                  setTotpInput(e.target.value);
                }}
                placeholder="Paste the otpauth:// link or the manual setup key"
                autoComplete="off"
                spellCheck={false}
                className="h-7 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                From the site&apos;s &ldquo;set up an authenticator app&rdquo;
                step. The seed is sealed on this login — codes are generated and
                typed for you; nobody, including agents, can read it back. You
                can leave this blank, save the login now, and add it later.
              </p>
              {totpDecodeError && (
                <p className="text-xs text-destructive">{totpDecodeError}</p>
              )}
            </div>
          )}
          {(twoFactor === "sms" || twoFactor === "other") && (
            <p className="text-xs text-muted-foreground">
              Saved with the login so Matrx knows to hand control back to you at
              the verification step instead of getting stuck.
            </p>
          )}
        </div>
      )}

      {isWebsiteLogin && !assigning && !attachmentOnly && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <div>
            <p className="text-xs font-semibold">Additional protected items</p>
            <p className="text-xs text-muted-foreground">
              Add any pieces you already have. Everything here is encrypted, and
              every piece can also be added later from the saved login.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {!showRecoveryCodes && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowRecoveryCodes(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Recovery codes
              </Button>
            )}
            {!showSecureNotes && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShowSecureNotes(true)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Secure note
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setSupplementalAttachments((current) => [
                  ...current,
                  emptyAttachmentDraft(),
                ])
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Protected file
            </Button>
          </div>

          {showRecoveryCodes && (
            <div className="space-y-1.5 rounded-md bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="vault-create-recovery-codes">
                  Recovery codes
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setRecoveryCodes("");
                    setShowRecoveryCodes(false);
                  }}
                >
                  Remove
                </Button>
              </div>
              <Textarea
                id="vault-create-recovery-codes"
                value={recoveryCodes}
                onChange={(event) => setRecoveryCodes(event.target.value)}
                rows={5}
                className="font-mono"
                placeholder="Paste one recovery code per line"
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-muted-foreground">
                Stored as a Restricted encrypted field. After using one, open
                this login and mark that code used.
              </p>
            </div>
          )}

          {showSecureNotes && (
            <div className="space-y-1.5 rounded-md bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <Label
                  htmlFor="vault-create-secure-notes"
                  className="flex items-center gap-1.5"
                >
                  <NotebookPen className="h-3.5 w-3.5" />
                  Secure note
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSecureNotes("");
                    setShowSecureNotes(false);
                  }}
                >
                  Remove
                </Button>
              </div>
              <Textarea
                id="vault-create-secure-notes"
                value={secureNotes}
                onChange={(event) => setSecureNotes(event.target.value)}
                rows={4}
                placeholder="Private account details, security answers, or setup notes"
              />
              <p className="text-xs text-muted-foreground">
                Encrypted and hidden until you explicitly reveal it.
              </p>
            </div>
          )}

          {supplementalAttachments.map((attachment, index) => (
            <div key={index} className="space-y-3 rounded-md bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-xs font-semibold">
                  <FileKey2 className="h-3.5 w-3.5" />
                  Protected file {index + 1}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setSupplementalAttachments((current) =>
                      current.filter(
                        (_, currentIndex) => currentIndex !== index,
                      ),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor={`vault-create-file-${index}`}>File</Label>
                  <Input
                    id={`vault-create-file-${index}`}
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setSupplementalAttachments((current) =>
                        current.map((currentAttachment, currentIndex) =>
                          currentIndex === index
                            ? {
                                ...currentAttachment,
                                file,
                                label:
                                  currentAttachment.label || file?.name || "",
                              }
                            : currentAttachment,
                        ),
                      );
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`vault-create-file-label-${index}`}>
                    Label
                  </Label>
                  <Input
                    id={`vault-create-file-label-${index}`}
                    value={attachment.label}
                    onChange={(event) =>
                      setSupplementalAttachments((current) =>
                        current.map((currentAttachment, currentIndex) =>
                          currentIndex === index
                            ? {
                                ...currentAttachment,
                                label: event.target.value,
                              }
                            : currentAttachment,
                        ),
                      )
                    }
                    placeholder="npm recovery codes"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor={`vault-create-file-purpose-${index}`}>
                    Purpose (optional)
                  </Label>
                  <Input
                    id={`vault-create-file-purpose-${index}`}
                    value={attachment.description}
                    onChange={(event) =>
                      setSupplementalAttachments((current) =>
                        current.map((currentAttachment, currentIndex) =>
                          currentIndex === index
                            ? {
                                ...currentAttachment,
                                description: event.target.value,
                              }
                            : currentAttachment,
                        ),
                      )
                    }
                    placeholder="Backup codes downloaded during 2FA setup"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Download protection</Label>
                  <VaultHandlingControl
                    value={attachment.handling}
                    onValueChange={(handling) =>
                      setSupplementalAttachments((current) =>
                        current.map((currentAttachment, currentIndex) =>
                          currentIndex === index
                            ? { ...currentAttachment, handling }
                            : currentAttachment,
                        ),
                      )
                    }
                    disabled={busy}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {!attachmentOnly && (
        <div className="space-y-3 rounded-md border border-border p-3">
          {drafts.map((draft, index) => (
            <div key={draft.def.field_key} className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <Label htmlFor={`vault-field-${draft.def.field_key}`}>
                  {draft.def.label}
                </Label>
                {(isWebsiteLogin || !(draft.def.required ?? true)) && (
                  <span className="text-xs text-muted-foreground">
                    optional
                  </span>
                )}
                <Badge variant="outline" className="font-normal">
                  {HANDLING_LABELS[normalizeVaultHandling(draft.def.handling)]}
                </Badge>
              </div>
              {draft.def.description && (
                <p className="text-xs text-muted-foreground">
                  {draft.def.description}
                </p>
              )}
              {isGeneratedField(draft.def.field_key) ? (
                <p className="rounded border border-dashed border-border p-2 text-xs text-muted-foreground">
                  Matrx will generate this value on the server and store it on
                  the recipient&apos;s item. You will never see it.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      id={`vault-field-${draft.def.field_key}`}
                      type={
                        (draft.def.handling ?? "revealable") === "visible" ||
                        shownFieldKeys.has(draft.def.field_key)
                          ? "text"
                          : "password"
                      }
                      value={draft.value}
                      onChange={(e) =>
                        setDraft(index, { value: e.target.value })
                      }
                      placeholder={draft.def.placeholder_example ?? ""}
                      className="min-w-48 flex-1 font-mono"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore
                      data-bwignore="true"
                    />
                    {(draft.def.handling ?? "revealable") !== "visible" && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() =>
                          setShownFieldKeys((current) => {
                            const next = new Set(current);
                            if (next.has(draft.def.field_key)) {
                              next.delete(draft.def.field_key);
                            } else {
                              next.add(draft.def.field_key);
                            }
                            return next;
                          })
                        }
                        aria-label={`${shownFieldKeys.has(draft.def.field_key) ? "Hide" : "Show"} ${draft.def.label}`}
                      >
                        {shownFieldKeys.has(draft.def.field_key) ? (
                          <EyeOff className="mr-1.5 h-4 w-4" />
                        ) : (
                          <Eye className="mr-1.5 h-4 w-4" />
                        )}
                        {shownFieldKeys.has(draft.def.field_key)
                          ? "Hide"
                          : "Show"}
                      </Button>
                    )}
                    {draft.def.field_key === GENERATED_FIELD_KEY && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => {
                          setDraft(index, { value: generateVaultPassword() });
                          setShownFieldKeys((current) => {
                            const next = new Set(current);
                            next.add(draft.def.field_key);
                            return next;
                          });
                        }}
                      >
                        <RefreshCw className="mr-1.5 h-4 w-4" />
                        Generate
                      </Button>
                    )}
                  </div>
                  {definition.key === ENV_VALUE_DEFINITION_KEY ? (
                    <div className="flex flex-wrap items-center gap-3 rounded-md bg-muted/30 p-2">
                      <FieldRuntimeSettings
                        draft={draft}
                        onChange={(patch) => setDraft(index, patch)}
                        placeholder="DATA_FOR_SEO_EMAIL"
                      />
                    </div>
                  ) : (
                    <details
                      className="rounded-md border border-border bg-muted/20 px-3 py-2"
                      open={
                        draft.inject || Boolean(draft.envKey) ? true : undefined
                      }
                    >
                      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
                        Advanced field settings
                      </summary>
                      <div className="mt-3">
                        <FieldRuntimeSettings
                          draft={draft}
                          onChange={(patch) => setDraft(index, patch)}
                          placeholder="OPTIONAL_RUNTIME_KEY"
                        />
                      </div>
                    </details>
                  )}
                </>
              )}
            </div>
          ))}
          {drafts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              This definition declares no encrypted fields — everything it holds
              is plaintext metadata.
            </p>
          )}
        </div>
      )}

      {/* Not encrypted — the twin of VaultItemDetail's NotEncryptedSection */}
      {showNotEncrypted && (
        <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold">Notes and other details</p>
            <Badge
              variant="outline"
              className="border-amber-500/40 text-[10px]"
            >
              Not encrypted
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Do not put passwords, tokens, recovery codes, or other secrets here.
          </p>

          {extraMetaDefs.map((def) => (
            <div key={def.field_key} className="space-y-1">
              <Label
                htmlFor={`vault-meta-${def.field_key}`}
                className="text-xs"
              >
                {def.label}
              </Label>
              <Input
                id={`vault-meta-${def.field_key}`}
                value={metaValues[def.field_key] ?? ""}
                onChange={(e) =>
                  setMetaValues((current) => ({
                    ...current,
                    [def.field_key]: e.target.value,
                  }))
                }
                placeholder={def.placeholder_example ?? ""}
                className="h-8 text-xs"
                autoComplete="off"
              />
              {def.description && (
                <p className="text-xs text-muted-foreground">
                  {def.description}
                </p>
              )}
            </div>
          ))}

          {showNotes && (
            <div className="space-y-1">
              <Label htmlFor="vault-create-notes" className="text-xs">
                {notesDef?.label ?? "Notes"}
              </Label>
              <Textarea
                id="vault-create-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="text-xs"
                placeholder="Anything that is not a secret — account numbers, support contacts, reminders."
              />
            </div>
          )}
        </div>
      )}

      {problems.length > 0 && (
        <p className="text-xs text-muted-foreground">{problems[0]}</p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy || problems.length > 0}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : assigning ? (
            <UserPlus className="mr-2 h-4 w-4" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {assigning ? "Create for recipient" : "Save credential"}
        </Button>
      </div>
    </form>
  );
}

// ── Custom builder ────────────────────────────────────────────────────────

interface CustomFieldDraft {
  fieldName: string;
  value: string;
  envKey: string;
  handling: VaultHandling;
  inject: boolean;
}

const EMPTY_CUSTOM_FIELD: CustomFieldDraft = {
  fieldName: "",
  value: "",
  envKey: "",
  handling: "revealable",
  inject: false,
};

const customFieldKey = (field: CustomFieldDraft): string =>
  sanitizeFieldName(field.fieldName);

function CustomBuilder({
  principal,
  mode,
  busy,
  onCreate,
  onAssign,
}: {
  principal: VaultPrincipal;
  mode: CreateMode;
  busy: boolean;
  onCreate: (body: VaultItemCreateRequest) => Promise<VaultItem>;
  onAssign: (body: VaultAssignRequest) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<CustomFieldDraft[]>([
    { ...EMPTY_CUSTOM_FIELD },
  ]);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [passwordMode, setPasswordMode] = useState<PasswordMode>("provided");

  const setField = (index: number, patch: Partial<CustomFieldDraft>) =>
    setFields((current) =>
      current.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );

  const assigning = mode === "assign";
  const canGenerate = fields.some(
    (field) => customFieldKey(field) === GENERATED_FIELD_KEY,
  );
  const generating = assigning && canGenerate && passwordMode === "generate";
  const isGeneratedField = (fieldKey: string) =>
    generating && fieldKey === GENERATED_FIELD_KEY;
  const recipient = recipientEmail.trim();

  const valid =
    displayName.trim().length > 0 &&
    fields.length > 0 &&
    fields.every(
      (f) =>
        FIELD_KEY_RE.test(customFieldKey(f)) &&
        (f.value.length > 0 || isGeneratedField(customFieldKey(f))) &&
        (!f.envKey || VALID_KEY_RE.test(f.envKey)) &&
        // Sandbox injection without an env key can never take effect and the
        // server refuses it — don't let the dialog build that request.
        (!f.inject || Boolean(f.envKey)),
    ) &&
    new Set(fields.map(customFieldKey)).size === fields.length &&
    (!assigning || EMAIL_RE.test(recipient));

  const buildFields = (): VaultFieldIn[] =>
    fields
      .filter((f) => !isGeneratedField(customFieldKey(f)))
      .map((f) => ({
        field_key: customFieldKey(f),
        value: f.value,
        env_key: f.envKey || null,
        handling: f.handling,
        editable: true,
        inject_into_sandbox: f.inject && Boolean(f.envKey),
        description: null,
      }));

  const submit = async () => {
    if (!valid) return;
    if (assigning) {
      await onAssign({
        recipient_email: recipient,
        display_name: displayName.trim(),
        description: description.trim() || null,
        definition_key: "custom",
        definition_version: 1,
        provider_key: null,
        fields: buildFields(),
        generate_field_key: generating ? GENERATED_FIELD_KEY : null,
      });
      return;
    }
    await onCreate({
      principal: toPrincipalIn(principal),
      display_name: displayName.trim(),
      description: description.trim() || null,
      definition_key: "custom",
      definition_version: 1,
      provider_key: null,
      source: "manual",
      fields: buildFields(),
    });
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {assigning && (
        <RecipientPanel
          email={recipientEmail}
          onEmailChange={setRecipientEmail}
          passwordMode={passwordMode}
          onPasswordModeChange={setPasswordMode}
          canGenerate={canGenerate}
        />
      )}

      <div className="space-y-1.5">
        <Label htmlFor="vault-custom-name">{VAULT_LABELS.credentialName}</Label>
        <Input
          id="vault-custom-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="My service credentials"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vault-custom-description">
          {VAULT_LABELS.description} (optional)
        </Label>
        <Input
          id="vault-custom-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What uses this credential?"
        />
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div
            key={index}
            className="space-y-2 rounded-md border border-border p-3"
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">{VAULT_LABELS.fieldName}</Label>
                <Input
                  value={field.fieldName}
                  onChange={(e) => {
                    const nextName = e.target.value;
                    const previousDefault = recommendedHandlingForFieldKey(
                      customFieldKey(field),
                    );
                    setField(index, {
                      fieldName: nextName,
                      ...(field.handling === previousDefault
                        ? {
                            handling: recommendedHandlingForFieldKey(
                              sanitizeFieldName(nextName),
                            ),
                          }
                        : {}),
                    });
                  }}
                  placeholder="API login"
                  className="h-8 text-xs"
                  aria-invalid={
                    Boolean(field.fieldName) &&
                    !FIELD_KEY_RE.test(customFieldKey(field))
                  }
                />
                {field.fieldName && (
                  <p className="whitespace-normal break-all text-[11px] text-muted-foreground">
                    {VAULT_LABELS.internalFieldKey}:{" "}
                    <code className="font-mono">
                      {customFieldKey(field) || "invalid"}
                    </code>
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{VAULT_LABELS.runtimeKey}</Label>
                <Input
                  value={field.envKey}
                  onChange={(e) => setField(index, { envKey: e.target.value })}
                  onPaste={(e) => {
                    // Pasting one `KEY=value` assignment fills key AND value.
                    const parsed = parseEnvAssignment(
                      e.clipboardData.getData("text"),
                    );
                    if (parsed) {
                      e.preventDefault();
                      setField(index, {
                        envKey: parsed.key,
                        value: parsed.value,
                        fieldName:
                          field.fieldName ||
                          parsed.key.replaceAll("_", " ") ||
                          "value",
                      });
                    }
                  }}
                  placeholder="DATA_FOR_SEO_EMAIL"
                  className="h-8 font-mono text-xs"
                  aria-invalid={
                    Boolean(field.envKey) && !VALID_KEY_RE.test(field.envKey)
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  Required when a workflow finds this value by name.
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{VAULT_LABELS.value}</Label>
              {isGeneratedField(customFieldKey(field)) ? (
                <p className="rounded border border-dashed border-border p-2 text-xs text-muted-foreground">
                  Matrx will generate this value on the server and store it on
                  the recipient&apos;s item. You will never see it.
                </p>
              ) : (
                <Input
                  type={field.handling === "visible" ? "text" : "password"}
                  value={field.value}
                  onChange={(e) => setField(index, { value: e.target.value })}
                  placeholder="Paste the value"
                  className="h-8 font-mono text-xs"
                  autoComplete="off"
                />
              )}
            </div>
            <div className="space-y-2">
              <div className="space-y-1">
                <Label className="text-xs">Protection</Label>
                <VaultHandlingControl
                  value={field.handling}
                  onValueChange={(next) => setField(index, { handling: next })}
                  disabled={busy}
                />
                <p className="text-[11px] text-muted-foreground">
                  Every value is encrypted at rest.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                  title={
                    field.envKey
                      ? undefined
                      : "Name the environment key first — a sandbox variable needs a name."
                  }
                >
                  {VAULT_LABELS.sandboxAccess}
                  <Switch
                    checked={field.inject && Boolean(field.envKey)}
                    disabled={!field.envKey}
                    onCheckedChange={(checked) =>
                      setField(index, { inject: checked })
                    }
                    aria-label="Inject into sandboxes"
                  />
                </label>
                {fields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() =>
                      setFields((current) =>
                        current.filter((_, i) => i !== index),
                      )
                    }
                    aria-label="Remove field"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setFields((current) => [...current, { ...EMPTY_CUSTOM_FIELD }])
          }
        >
          <Plus className="mr-2 h-4 w-4" />
          Add field
        </Button>
        <Button type="submit" size="sm" disabled={busy || !valid}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : assigning ? (
            <UserPlus className="mr-2 h-4 w-4" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          {assigning ? "Create for recipient" : "Save credential"}
        </Button>
      </div>
    </form>
  );
}
