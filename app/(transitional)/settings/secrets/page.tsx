"use client";

/**
 * Settings → Secrets — the user's per-account env-var / token vault.
 *
 * Backend: aidream `/api/user-secrets/*` (Fernet-encrypted at rest in
 * `public.user_secrets`). See `aidream/services/user_secrets/` for the
 * service layer; this page is the canonical UI.
 *
 * Three input methods (per user spec):
 *   1. Manual key/value form
 *   2. .env file upload
 *   3. Agent chat ("save my GitHub token: ghp_…") — separate code path,
 *      `user_secret_set` registered tool. UI surfaces resulting rows here.
 *
 * Auto-inject by default: every secret with `inject_into_sandbox=true` is
 * passed into `config.env` when a new sandbox is created (both auto-
 * provisioned and the SandboxPanel's "New sandbox" button).
 */

import { useMemo, useRef, useState } from "react";
import {
  KeyRound,
  Plus,
  Trash2,
  Upload,
  Eye,
  EyeOff,
  Pencil,
  Loader2,
  AlertCircle,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

import {
  useBulkImportEnv,
  useCreateSecret,
  useDeleteSecret,
  useSecrets,
  useUpdateSecret,
} from "@/features/secrets/hooks";
import {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  VALID_KEY_RE,
  type SecretCategory,
} from "@/features/secrets/types";

export default function SecretsSettingsPage() {
  const { secrets, loading, error, refresh } = useSecrets();
  const { run: createSecret, busy: creating } = useCreateSecret(refresh);
  const { run: updateSecret, busy: updating } = useUpdateSecret(refresh);
  const { run: deleteSecret, busy: deleting } = useDeleteSecret(refresh);
  const { run: bulkImport, busy: importing } = useBulkImportEnv(refresh);

  return (
    <div className="mx-auto max-w-4xl p-4 md:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="flex items-center gap-3 text-2xl font-bold md:text-3xl">
          <KeyRound className="h-7 w-7 text-primary" />
          Secrets
        </h1>
        <p className="mt-2 text-sm text-muted-foreground md:text-base">
          Set a secret once — GitHub token, OpenAI key, anything else — and
          it's auto-injected into every sandbox you create and available to
          every agent acting on your behalf. Encrypted at rest, never shown
          in full again, only ever transmitted over an authenticated channel.
        </p>
      </div>

      <AddSecretCard
        onCreate={createSecret}
        busy={creating}
      />

      <EnvUploadCard onImport={bulkImport} busy={importing} />

      <SecretsListCard
        secrets={secrets}
        loading={loading}
        error={error}
        onUpdate={updateSecret}
        onDelete={deleteSecret}
        busy={updating || deleting}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Add one secret
// ──────────────────────────────────────────────────────────────────────────

function AddSecretCard({
  onCreate,
  busy,
}: {
  onCreate: ReturnType<typeof useCreateSecret>["run"];
  busy: boolean;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [category, setCategory] = useState<SecretCategory>("custom");
  const [description, setDescription] = useState("");
  const [injectIntoSandbox, setInjectIntoSandbox] = useState(true);

  const keyValid = !key || VALID_KEY_RE.test(key);
  const canSubmit = !!key && keyValid && !!value && !busy;

  const submit = async () => {
    try {
      await onCreate({
        key,
        value,
        category,
        description: description || null,
        inject_into_sandbox: injectIntoSandbox,
        upsert: false,
      });
      setKey("");
      setValue("");
      setDescription("");
    } catch {
      // toast handled in the hook
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plus className="h-5 w-5" />
          Add a secret
        </CardTitle>
        <CardDescription>
          Paste a single key/value pair. The KEY must be a valid env-var
          name (letters, digits, underscore; can't start with a digit).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="new-key">Key</Label>
            <Input
              id="new-key"
              placeholder="GITHUB_TOKEN"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              className="font-mono"
              aria-invalid={!keyValid}
            />
            {!keyValid && (
              <p className="text-xs text-destructive">
                Letters/digits/underscore only; cannot start with a digit.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-category">Category</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as SecretCategory)}
            >
              <SelectTrigger id="new-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-value">Value</Label>
          <Input
            id="new-value"
            type="password"
            placeholder="ghp_…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="font-mono"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-description">Description (optional)</Label>
          <Input
            id="new-description"
            placeholder="e.g. fine-grained PAT for the matrx-ship repo"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div className="space-y-0.5">
            <Label htmlFor="new-inject">Auto-inject into sandboxes</Label>
            <p className="text-xs text-muted-foreground">
              When on, this secret is set as an env var in every new sandbox
              you create — visible to your agent without any extra step.
            </p>
          </div>
          <Switch
            id="new-inject"
            checked={injectIntoSandbox}
            onCheckedChange={setInjectIntoSandbox}
          />
        </div>
        <div className="flex justify-end pt-1">
          <Button onClick={submit} disabled={!canSubmit}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Save secret
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// .env upload
// ──────────────────────────────────────────────────────────────────────────

function EnvUploadCard({
  onImport,
  busy,
}: {
  onImport: ReturnType<typeof useBulkImportEnv>["run"];
  busy: boolean;
}) {
  const [text, setText] = useState("");
  const [defaultCategory, setDefaultCategory] =
    useState<SecretCategory>("custom");
  const [injectIntoSandbox, setInjectIntoSandbox] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFile = async (file: File) => {
    const content = await file.text();
    setText(content);
  };

  const submit = async () => {
    if (!text.trim()) return;
    await onImport({
      env_text: text,
      default_category: defaultCategory,
      inject_into_sandbox: injectIntoSandbox,
    });
    setText("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Bulk import from .env
        </CardTitle>
        <CardDescription>
          Upload a `.env` file or paste its contents. Every well-formed
          KEY=value line is added or updated. Comments and blank lines are
          ignored.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".env,.env.local,.env.production,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            type="button"
          >
            <Upload className="mr-2 h-4 w-4" />
            Choose .env file…
          </Button>
          <span className="text-xs text-muted-foreground">
            Or paste below
          </span>
        </div>
        <Textarea
          placeholder={`GITHUB_TOKEN=ghp_…\nOPENAI_API_KEY=sk-…\n# comments OK`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-32 font-mono text-xs"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="env-default-cat">Default category</Label>
            <Select
              value={defaultCategory}
              onValueChange={(v) => setDefaultCategory(v as SecretCategory)}
            >
              <SelectTrigger id="env-default-cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ALL_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="env-inject">Auto-inject into sandboxes</Label>
            </div>
            <Switch
              id="env-inject"
              checked={injectIntoSandbox}
              onCheckedChange={setInjectIntoSandbox}
            />
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <Button onClick={submit} disabled={!text.trim() || busy}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Existing secrets list
// ──────────────────────────────────────────────────────────────────────────

function SecretsListCard({
  secrets,
  loading,
  error,
  onUpdate,
  onDelete,
  busy,
}: {
  secrets: ReturnType<typeof useSecrets>["secrets"];
  loading: boolean;
  error: string | null;
  onUpdate: ReturnType<typeof useUpdateSecret>["run"];
  onDelete: ReturnType<typeof useDeleteSecret>["run"];
  busy: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your secrets</CardTitle>
        <CardDescription>
          Values are encrypted at rest. The preview shows the first/last 4
          characters only — the full value never leaves the server again.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{error}</div>
          </div>
        )}
        {!loading && secrets.length === 0 && !error && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No secrets yet. Add one above or upload a .env file.
          </p>
        )}
        {secrets.map((s) => (
          <SecretRow
            key={s.id}
            secret={s}
            onUpdate={onUpdate}
            onDelete={onDelete}
            disabled={busy}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SecretRow({
  secret,
  onUpdate,
  onDelete,
  disabled,
}: {
  secret: ReturnType<typeof useSecrets>["secrets"][number];
  onUpdate: ReturnType<typeof useUpdateSecret>["run"];
  onDelete: ReturnType<typeof useDeleteSecret>["run"];
  disabled: boolean;
}) {
  const [showHint, setShowHint] = useState(false);
  const [editing, setEditing] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [description, setDescription] = useState(secret.description ?? "");

  const lastUsed = useMemo(() => {
    if (!secret.last_used_at) return "never";
    const d = new Date(secret.last_used_at);
    return d.toLocaleString();
  }, [secret.last_used_at]);

  const onRotate = async () => {
    if (!newValue) return;
    await onUpdate(secret.key, { value: newValue });
    setNewValue("");
    setEditing(false);
  };

  const onToggleInject = async (next: boolean) => {
    await onUpdate(secret.key, { inject_into_sandbox: next });
  };

  const onSaveDescription = async () => {
    if (description === (secret.description ?? "")) return;
    await onUpdate(secret.key, { description });
  };

  return (
    <div className="rounded-md border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        <code className="font-mono text-sm font-semibold">{secret.key}</code>
        {secret.category && (
          <Badge variant="secondary">{secret.category}</Badge>
        )}
        {!secret.is_active && <Badge variant="outline">disabled</Badge>}
        {!secret.inject_into_sandbox && (
          <Badge variant="outline">no-inject</Badge>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          last used: {lastUsed}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 font-mono text-xs">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setShowHint((v) => !v)}
          title={showHint ? "Hide preview" : "Show preview"}
          type="button"
        >
          {showHint ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </Button>
        <span className="select-all text-muted-foreground">
          {showHint ? (secret.value_hint || "•••") : "•••••••••••"}
        </span>
      </div>
      {secret.description && !editing && (
        <p className="mt-1 text-xs text-muted-foreground">
          {secret.description}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
          <Switch
            checked={secret.inject_into_sandbox}
            onCheckedChange={onToggleInject}
            disabled={disabled}
            id={`inject-${secret.id}`}
          />
          <Label htmlFor={`inject-${secret.id}`} className="cursor-pointer">
            Inject into sandbox
          </Label>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setEditing((v) => !v)}
          disabled={disabled}
          type="button"
        >
          <Pencil className="mr-2 h-3.5 w-3.5" />
          {editing ? "Cancel" : "Rotate / edit"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(secret.key)}
          disabled={disabled}
          className="text-destructive hover:text-destructive"
          type="button"
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete
        </Button>
      </div>
      {editing && (
        <div className="mt-3 space-y-2 rounded-md border bg-muted/30 p-3">
          <div className="space-y-1.5">
            <Label htmlFor={`new-value-${secret.id}`}>New value</Label>
            <Input
              id={`new-value-${secret.id}`}
              type="password"
              placeholder="(leave empty to keep current)"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`desc-${secret.id}`}>Description</Label>
            <Input
              id={`desc-${secret.id}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={onSaveDescription}
            />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={onRotate} disabled={!newValue || disabled}>
              Rotate value
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
