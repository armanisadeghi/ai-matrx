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
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  Globe,
  Loader2,
  Plus,
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
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza-modal/credenza";

import { parseEnvAssignment } from "../utils";
import {
  FAMILY_LABELS,
  FIELD_KEY_RE,
  URI_MATCH_MODE_LABELS,
  VALID_KEY_RE,
  WEBSITE_LOGIN_DEFINITION_KEY,
  effectiveFields,
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

interface VaultCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  principal: VaultPrincipal;
  definitions: CredentialDefinition[];
  busy: boolean;
  onCreate: (body: VaultItemCreateRequest) => Promise<VaultItem>;
  onAssign: (body: VaultAssignRequest) => Promise<VaultAssignResponse>;
}

type Step =
  | { kind: "pick" }
  | { kind: "form"; definition: CredentialDefinition }
  | { kind: "custom" };

/** Who ends up owning the credential. */
type CreateMode = "self" | "assign";

/** Where the assigned item's password comes from. */
type PasswordMode = "provided" | "generate";

/** The one field the server may generate. Its value never reaches this
 *  browser — the request omits it from `fields[]` entirely. */
const GENERATED_FIELD_KEY = "password";

/** Metadata field keys that map to first-class item columns; every other
 *  metadata field is written into `non_secret_fields`. */
const RESERVED_METADATA_KEYS: readonly string[] = ["login_urls", "notes"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
}: VaultCreateDialogProps) {
  const [step, setStep] = useState<Step>({ kind: "pick" });
  const [mode, setMode] = useState<CreateMode>("self");
  const [assigned, setAssigned] = useState<VaultAssignResponse | null>(null);

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) {
      setStep({ kind: "pick" });
      setMode("self");
      setAssigned(null);
    }
  };

  const submitCreate = async (body: VaultItemCreateRequest) => {
    await onCreate(body);
    close(false);
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
              <ModeToggle mode={mode} onChange={setMode} />

              {step.kind === "pick" && (
                <DefinitionPicker
                  definitions={definitions}
                  onPick={(definition) => setStep({ kind: "form", definition })}
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
          <dt className="w-20 shrink-0 text-muted-foreground">Name</dt>
          <dd className="min-w-0 flex-1 truncate">{result.display_name}</dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Type</dt>
          <dd className="min-w-0 flex-1 truncate font-mono">
            {result.definition_key}
          </dd>
        </div>
        <div className="flex items-baseline gap-2">
          <dt className="w-20 shrink-0 text-muted-foreground">Item</dt>
          <dd className="min-w-0 flex-1 truncate font-mono">{result.id}</dd>
        </div>
      </dl>

      {result.generated ? (
        <div className="space-y-1 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold">Password generated privately</p>
            <Badge variant="outline" className="border-amber-500/40 text-[10px]">
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

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search 120+ credential types"
            className="pl-8"
            aria-label="Search credential types"
          />
        </div>
        <Button variant="outline" size="sm" onClick={onCustom}>
          <Wrench className="mr-2 h-4 w-4" />
          Custom
        </Button>
      </div>

      {definitions.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          The credential catalog is empty or still loading — use Custom to
          build one from generic fields.
        </p>
      ) : grouped.length === 0 ? (
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
                {defs.map((def) => (
                  <button
                    key={def.key}
                    type="button"
                    onClick={() => onPick(def)}
                    className="min-w-0 rounded-md border border-border bg-card p-2.5 text-left transition-colors hover:border-primary/40 hover:bg-accent/40"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium">
                        {def.payload.label}
                      </p>
                      {def.payload.provider_key && (
                        <Badge variant="outline" className="shrink-0 font-normal">
                          preset
                        </Badge>
                      )}
                    </div>
                    {def.payload.description && (
                      <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                        {def.payload.description}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 2: definition-driven form ────────────────────────────────────────

interface FieldDraft {
  def: CredentialFieldDef;
  value: string;
  envKey: string;
  inject: boolean;
}

function DefinitionForm({
  definition,
  definitions,
  principal,
  mode,
  busy,
  onCreate,
  onAssign,
}: {
  definition: CredentialDefinition;
  definitions: CredentialDefinition[];
  principal: VaultPrincipal;
  mode: CreateMode;
  busy: boolean;
  onCreate: (body: VaultItemCreateRequest) => Promise<void>;
  onAssign: (body: VaultAssignRequest) => Promise<void>;
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
  const [uriMatchMode, setUriMatchMode] = useState<UriMatchMode>("host");
  const [browserFill, setBrowserFill] = useState(true);
  const [notes, setNotes] = useState("");
  const [metaValues, setMetaValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(extraMetaDefs.map((d) => [d.field_key, ""])),
  );
  const [recipientEmail, setRecipientEmail] = useState("");
  const [passwordMode, setPasswordMode] = useState<PasswordMode>("provided");

  const setDraft = (index: number, patch: Partial<FieldDraft>) =>
    setDrafts((current) =>
      current.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );

  const urls = loginUrls.map((u) => u.trim()).filter(Boolean);
  const assigning = mode === "assign";
  const canGenerate = drafts.some((d) => d.def.field_key === GENERATED_FIELD_KEY);
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
  for (const draft of drafts) {
    if (isGeneratedField(draft.def.field_key)) continue;
    const label = draft.def.label;
    if ((draft.def.required ?? true) && !draft.value) {
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
  if (loginUrlDef && (loginUrlDef.required ?? true) && urls.length === 0) {
    problems.push(`${loginUrlDef.label} is required.`);
  }
  const hasAnyValue =
    drafts.some((d) => d.value) ||
    urls.length > 0 ||
    Boolean(notes.trim()) ||
    Object.values(metaValues).some((v) => v.trim());
  if (!hasAnyValue && !generating) problems.push("Enter at least one value.");

  const buildFields = (): VaultFieldIn[] =>
    drafts
      .filter((d) => d.value && !isGeneratedField(d.def.field_key))
      .map((d) => ({
        field_key: d.def.field_key,
        value: d.value,
        env_key: d.envKey || null,
        handling: (d.def.handling ?? "revealable") as VaultHandling,
        editable: d.def.editable ?? true,
        inject_into_sandbox: d.inject && Boolean(d.envKey),
        description: d.def.description ?? null,
      }));

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

    await onCreate({
      principal: toPrincipalIn(principal),
      display_name: displayName.trim(),
      description: description.trim() || null,
      definition_key: definitionKey,
      definition_version: 1,
      provider_key: providerKey,
      fields: buildFields(),
      source: "manual",
      ...buildMetadata(),
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
      {definition.payload.description && (
        <p className="text-xs text-muted-foreground">
          {definition.payload.description}
        </p>
      )}
      {(definition.payload.setup_hints ?? []).length > 0 && (
        <ul className="list-inside list-disc space-y-0.5 rounded-md bg-muted/40 p-2.5 text-xs text-muted-foreground">
          {(definition.payload.setup_hints ?? []).map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
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
        <Label htmlFor="vault-create-name">Name</Label>
        <Input
          id="vault-create-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Production Stripe"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vault-create-description">Description (optional)</Label>
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
            {loginUrlDef?.required === false && (
              <span className="text-xs text-muted-foreground">optional</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {loginUrlDef?.description ??
              "Where this login is used. Stored as plain, unencrypted metadata so Matrx can match the page — never put a secret here."}
          </p>

          {loginUrls.map((url, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={url}
                onChange={(e) =>
                  setLoginUrls((current) =>
                    current.map((u, i) => (i === index ? e.target.value : u)),
                  )
                }
                placeholder={
                  loginUrlDef?.placeholder_example ??
                  "https://example.com/login"
                }
                className="h-8 font-mono text-xs"
                inputMode="url"
                autoComplete="off"
                aria-label={`Login URL ${index + 1}`}
              />
              {loginUrls.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() =>
                    setLoginUrls((current) =>
                      current.filter((_, i) => i !== index),
                    )
                  }
                  aria-label={`Remove login URL ${index + 1}`}
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
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
                <Label className="text-xs">When it matches</Label>
                <Select
                  value={uriMatchMode}
                  onValueChange={(next) => setUriMatchMode(next as UriMatchMode)}
                >
                  <SelectTrigger
                    className="h-7 text-xs"
                    aria-label="URL match rule"
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

      <div className="space-y-3 rounded-md border border-border p-3">
        {drafts.map((draft, index) => (
          <div key={draft.def.field_key} className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Label htmlFor={`vault-field-${draft.def.field_key}`}>
                {draft.def.label}
              </Label>
              {!(draft.def.required ?? true) && (
                <span className="text-xs text-muted-foreground">optional</span>
              )}
              <Badge variant="outline" className="font-normal">
                {draft.def.handling ?? "revealable"}
              </Badge>
            </div>
            {draft.def.description && (
              <p className="text-xs text-muted-foreground">
                {draft.def.description}
              </p>
            )}
            {isGeneratedField(draft.def.field_key) ? (
              <p className="rounded border border-dashed border-border p-2 text-xs text-muted-foreground">
                Matrx will generate this value on the server and store it on the
                recipient&apos;s item. You will never see it.
              </p>
            ) : (
              <>
                <Input
                  id={`vault-field-${draft.def.field_key}`}
                  type={(draft.def.handling ?? "revealable") === "visible" ? "text" : "password"}
                  value={draft.value}
                  onChange={(e) => setDraft(index, { value: e.target.value })}
                  placeholder={draft.def.placeholder_example ?? ""}
                  className="font-mono"
                  autoComplete="off"
                />
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex min-w-0 flex-1 basis-48 items-center gap-2">
                    <Label
                      htmlFor={`vault-env-${draft.def.field_key}`}
                      className="shrink-0 text-xs text-muted-foreground"
                    >
                      Env key
                    </Label>
                    <Input
                      id={`vault-env-${draft.def.field_key}`}
                      value={draft.envKey}
                      onChange={(e) => setDraft(index, { envKey: e.target.value })}
                      placeholder="OPTIONAL_ENV_ALIAS"
                      className="h-8 font-mono text-xs"
                      aria-invalid={Boolean(draft.envKey) && !VALID_KEY_RE.test(draft.envKey)}
                    />
                  </div>
                  <label
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                    title={
                      draft.envKey
                        ? undefined
                        : "Name the environment key first — a sandbox variable needs a name."
                    }
                  >
                    Sandbox
                    <Switch
                      checked={draft.inject && Boolean(draft.envKey)}
                      disabled={!draft.envKey}
                      onCheckedChange={(checked) => setDraft(index, { inject: checked })}
                      aria-label={`Inject ${draft.def.label} into sandboxes`}
                    />
                  </label>
                </div>
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

      {/* Not encrypted — the twin of VaultItemDetail's NotEncryptedSection */}
      {showNotEncrypted && (
        <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold">Notes and other details</p>
            <Badge variant="outline" className="border-amber-500/40 text-[10px]">
              Not encrypted
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Do not put passwords, tokens, recovery codes, or other secrets here.
          </p>

          {extraMetaDefs.map((def) => (
            <div key={def.field_key} className="space-y-1">
              <Label htmlFor={`vault-meta-${def.field_key}`} className="text-xs">
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
              <textarea
                id="vault-create-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full rounded border border-border bg-background p-2 text-xs"
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
  fieldKey: string;
  value: string;
  envKey: string;
  handling: VaultHandling;
  inject: boolean;
}

const EMPTY_CUSTOM_FIELD: CustomFieldDraft = {
  fieldKey: "",
  value: "",
  envKey: "",
  handling: "revealable",
  inject: false,
};

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
  onCreate: (body: VaultItemCreateRequest) => Promise<void>;
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
  const canGenerate = fields.some((f) => f.fieldKey === GENERATED_FIELD_KEY);
  const generating = assigning && canGenerate && passwordMode === "generate";
  const isGeneratedField = (fieldKey: string) =>
    generating && fieldKey === GENERATED_FIELD_KEY;
  const recipient = recipientEmail.trim();

  const valid =
    displayName.trim().length > 0 &&
    fields.length > 0 &&
    fields.every(
      (f) =>
        FIELD_KEY_RE.test(f.fieldKey) &&
        (f.value.length > 0 || isGeneratedField(f.fieldKey)) &&
        (!f.envKey || VALID_KEY_RE.test(f.envKey)) &&
        // Sandbox injection without an env key can never take effect and the
        // server refuses it — don't let the dialog build that request.
        (!f.inject || Boolean(f.envKey)),
    ) &&
    new Set(fields.map((f) => f.fieldKey)).size === fields.length &&
    (!assigning || EMAIL_RE.test(recipient));

  const buildFields = (): VaultFieldIn[] =>
    fields
      .filter((f) => !isGeneratedField(f.fieldKey))
      .map((f) => ({
        field_key: f.fieldKey,
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
        <Label htmlFor="vault-custom-name">Name</Label>
        <Input
          id="vault-custom-name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="My service credentials"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="vault-custom-description">Description (optional)</Label>
        <Input
          id="vault-custom-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What uses this credential?"
        />
      </div>

      <div className="space-y-3">
        {fields.map((field, index) => (
          <div key={index} className="space-y-2 rounded-md border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Field key</Label>
                <Input
                  value={field.fieldKey}
                  onChange={(e) =>
                    setField(index, {
                      fieldKey: e.target.value.toLowerCase(),
                    })
                  }
                  placeholder="api_key"
                  className="h-8 font-mono text-xs"
                  aria-invalid={
                    Boolean(field.fieldKey) && !FIELD_KEY_RE.test(field.fieldKey)
                  }
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Env key (optional)</Label>
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
                        fieldKey:
                          field.fieldKey ||
                          parsed.key.toLowerCase().replace(/^[^a-z]+/, "") ||
                          "value",
                      });
                    }
                  }}
                  placeholder="MY_API_KEY"
                  className="h-8 font-mono text-xs"
                  aria-invalid={Boolean(field.envKey) && !VALID_KEY_RE.test(field.envKey)}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Value</Label>
              {isGeneratedField(field.fieldKey) ? (
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
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <Select
                  value={field.handling}
                  onValueChange={(next) =>
                    setField(index, { handling: next as VaultHandling })
                  }
                >
                  <SelectTrigger className="h-8 w-32 text-xs" aria-label="Handling">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visible">Visible</SelectItem>
                    <SelectItem value="revealable">Revealable</SelectItem>
                    <SelectItem value="sealed">Sealed</SelectItem>
                  </SelectContent>
                </Select>
                <label
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                  title={
                    field.envKey
                      ? undefined
                      : "Name the environment key first — a sandbox variable needs a name."
                  }
                >
                  Sandbox
                  <Switch
                    checked={field.inject && Boolean(field.envKey)}
                    disabled={!field.envKey}
                    onCheckedChange={(checked) => setField(index, { inject: checked })}
                    aria-label="Inject into sandboxes"
                  />
                </label>
              </div>
              {fields.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() =>
                    setFields((current) => current.filter((_, i) => i !== index))
                  }
                  aria-label="Remove field"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setFields((current) => [...current, { ...EMPTY_CUSTOM_FIELD }])}
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
