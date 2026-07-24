"use client";

/**
 * VaultCreateDialog — catalog picker (family-grouped, searchable, with a
 * "Custom" builder) + definition-driven create form. Field labels,
 * placeholders, validation, env aliases, and handling/editable/inject
 * defaults all come from the `credential_definition` catalog payload —
 * adding a provider changes catalog data, not this component.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, Search, Trash2, Wrench } from "lucide-react";

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
  VALID_KEY_RE,
  effectiveFields,
  toPrincipalIn,
  type CredentialDefinition,
  type CredentialFamily,
  type CredentialFieldDef,
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
}

type Step =
  | { kind: "pick" }
  | { kind: "form"; definition: CredentialDefinition }
  | { kind: "custom" };

export function VaultCreateDialog({
  open,
  onOpenChange,
  principal,
  definitions,
  busy,
  onCreate,
}: VaultCreateDialogProps) {
  const [step, setStep] = useState<Step>({ kind: "pick" });

  const close = (next: boolean) => {
    onOpenChange(next);
    if (!next) setStep({ kind: "pick" });
  };

  return (
    <Credenza open={open} onOpenChange={close}>
      <CredenzaContent className="md:max-w-2xl">
        <CredenzaHeader>
          <CredenzaTitle className="flex items-center gap-2">
            {step.kind !== "pick" && (
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
            {step.kind === "pick"
              ? "New credential"
              : step.kind === "custom"
                ? "Custom credential"
                : (step.definition.payload.label ?? step.definition.key)}
          </CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="max-h-[70dvh] overflow-y-auto pb-6">
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
              busy={busy}
              onCreate={async (body) => {
                await onCreate(body);
                close(false);
              }}
            />
          )}
          {step.kind === "custom" && (
            <CustomBuilder
              principal={principal}
              busy={busy}
              onCreate={async (body) => {
                await onCreate(body);
                close(false);
              }}
            />
          )}
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
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
  busy,
  onCreate,
}: {
  definition: CredentialDefinition;
  definitions: CredentialDefinition[];
  principal: VaultPrincipal;
  busy: boolean;
  onCreate: (body: VaultItemCreateRequest) => Promise<void>;
}) {
  const byKey = useMemo(
    () => new Map(definitions.map((d) => [d.key, d])),
    [definitions],
  );
  const fieldDefs = useMemo(
    () => effectiveFields(definition, byKey),
    [definition, byKey],
  );

  const [displayName, setDisplayName] = useState(definition.payload.label);
  const [description, setDescription] = useState("");
  const [drafts, setDrafts] = useState<FieldDraft[]>(() =>
    fieldDefs.map((def) => ({
      def,
      value: "",
      envKey: def.env_aliases?.[0] ?? "",
      inject: def.inject_into_sandbox ?? false,
    })),
  );

  const setDraft = (index: number, patch: Partial<FieldDraft>) =>
    setDrafts((current) =>
      current.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    );

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!displayName.trim()) list.push("A name is required.");
    for (const draft of drafts) {
      const label = draft.def.label;
      if ((draft.def.required ?? true) && !draft.value) {
        list.push(`${label} is required.`);
      }
      if (draft.value && draft.def.validation_regex) {
        try {
          if (!new RegExp(draft.def.validation_regex).test(draft.value)) {
            list.push(`${label} does not match the expected format.`);
          }
        } catch {
          // A broken regex in catalog data must not block saving.
        }
      }
      if (draft.envKey && !VALID_KEY_RE.test(draft.envKey)) {
        list.push(`${label}: environment key must be a valid identifier.`);
      }
    }
    if (drafts.every((d) => !d.value)) list.push("Enter at least one value.");
    return list;
  }, [displayName, drafts]);

  const submit = async () => {
    if (problems.length > 0) return;
    const fields: VaultFieldIn[] = drafts
      .filter((d) => d.value)
      .map((d) => ({
        field_key: d.def.field_key,
        value: d.value,
        env_key: d.envKey || null,
        handling: (d.def.handling ?? "revealable") as VaultHandling,
        editable: d.def.editable ?? true,
        inject_into_sandbox: d.inject,
        description: d.def.description ?? null,
      }));
    const baseKey = definition.payload.base_definition_key;
    await onCreate({
      principal: toPrincipalIn(principal),
      display_name: displayName.trim(),
      description: description.trim() || null,
      definition_key: baseKey ?? definition.key,
      definition_version: 1,
      provider_key: definition.payload.provider_key ?? (baseKey ? definition.key : null),
      fields,
      source: "manual",
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
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Sandbox
                <Switch
                  checked={draft.inject}
                  onCheckedChange={(checked) => setDraft(index, { inject: checked })}
                  aria-label={`Inject ${draft.def.label} into sandboxes`}
                />
              </label>
            </div>
          </div>
        ))}
        {drafts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            This definition declares no fields — pick another type or use Custom.
          </p>
        )}
      </div>

      {problems.length > 0 && (
        <p className="text-xs text-muted-foreground">{problems[0]}</p>
      )}
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={busy || problems.length > 0}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Save credential
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
  busy,
  onCreate,
}: {
  principal: VaultPrincipal;
  busy: boolean;
  onCreate: (body: VaultItemCreateRequest) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<CustomFieldDraft[]>([
    { ...EMPTY_CUSTOM_FIELD },
  ]);

  const setField = (index: number, patch: Partial<CustomFieldDraft>) =>
    setFields((current) =>
      current.map((f, i) => (i === index ? { ...f, ...patch } : f)),
    );

  const valid =
    displayName.trim().length > 0 &&
    fields.length > 0 &&
    fields.every(
      (f) =>
        FIELD_KEY_RE.test(f.fieldKey) &&
        f.value.length > 0 &&
        (!f.envKey || VALID_KEY_RE.test(f.envKey)),
    ) &&
    new Set(fields.map((f) => f.fieldKey)).size === fields.length;

  const submit = async () => {
    if (!valid) return;
    await onCreate({
      principal: toPrincipalIn(principal),
      display_name: displayName.trim(),
      description: description.trim() || null,
      definition_key: "custom",
      definition_version: 1,
      provider_key: null,
      source: "manual",
      fields: fields.map((f) => ({
        field_key: f.fieldKey,
        value: f.value,
        env_key: f.envKey || null,
        handling: f.handling,
        editable: true,
        inject_into_sandbox: f.inject,
        description: null,
      })),
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
              <Input
                type={field.handling === "visible" ? "text" : "password"}
                value={field.value}
                onChange={(e) => setField(index, { value: e.target.value })}
                placeholder="Paste the value"
                className="h-8 font-mono text-xs"
                autoComplete="off"
              />
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
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Sandbox
                  <Switch
                    checked={field.inject}
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
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Save credential
        </Button>
      </div>
    </form>
  );
}
