"use client";

/**
 * VaultItemDetail — one credential item's fields + lifecycle actions.
 * Which actions render is decided by the item's `capabilities`
 * (can_use / can_edit / can_reveal / can_manage), never by principal-
 * specific component forks.
 *
 * Revealed plaintext is component-local via `useTransientSecret` with a
 * ~30s auto-clear — never Redux, storage, or query caches.
 */
import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Building2,
  Check,
  Copy,
  Eye,
  EyeOff,
  GitFork,
  History,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
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
import { toast } from "@/lib/toast";
import {
  useOrganizationMembers,
  useUserOrganizations,
} from "@/features/organizations/hooks";
import { searchUserByEmail } from "@/features/organizations/userSearch";

import { useTransientSecret, useVaultAudit, type VaultActions } from "../vault-hooks";
import { resolveVaultFields, revealVaultField } from "../vault-service";
import {
  FIELD_KEY_RE,
  HANDLING_LABELS,
  VALID_KEY_RE,
  type CredentialDefinition,
  type VaultAccessMode,
  type VaultField,
  type VaultGrantee,
  type VaultHandling,
  type VaultItem,
  type VaultPrincipal,
} from "../types";

interface VaultItemDetailProps {
  item: VaultItem;
  principal: VaultPrincipal;
  definitions: Map<string, CredentialDefinition>;
  busy: boolean;
  actions: VaultActions;
  onClose: () => void;
}

type Panel = "none" | "share" | "transfer" | "fork" | "rotate" | "add-field" | "audit";

export function VaultItemDetail({
  item,
  principal,
  definitions,
  busy,
  actions,
  onClose,
}: VaultItemDetailProps) {
  const caps = item.capabilities;
  const definition = definitions.get(item.definition_key);
  const [panel, setPanel] = useState<Panel>("none");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(item.display_name);

  const fieldLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of definition?.payload.fields ?? []) {
      map.set(f.field_key, f.label);
    }
    return map;
  }, [definition]);

  return (
    <div className="space-y-4">
      {/* Header metadata */}
      <div className="space-y-2">
        {renaming ? (
          <div className="flex items-center gap-2">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="h-8"
              autoFocus
            />
            <Button
              size="icon"
              className="h-8 w-8 shrink-0"
              disabled={busy || !nameDraft.trim()}
              onClick={async () => {
                await actions.updateItem(item.id, { display_name: nameDraft.trim() });
                setRenaming(false);
              }}
              aria-label="Save name"
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8 shrink-0"
              onClick={() => {
                setNameDraft(item.display_name);
                setRenaming(false);
              }}
              aria-label="Cancel rename"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-normal">
              {definition?.payload.label ?? item.definition_key}
            </Badge>
            {item.provider_key && (
              <Badge variant="outline" className="font-normal">
                {item.provider_key}
              </Badge>
            )}
            <Badge variant="outline" className="font-normal capitalize">
              {item.status.replaceAll("_", " ")}
            </Badge>
            {item.organization_id && (
              <Badge variant="outline" className="gap-1 font-normal">
                <Building2 className="h-3 w-3" />
                {item.access_mode === "all_members" ? "All members" : "Restricted"}
              </Badge>
            )}
            {caps.can_edit && (
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setRenaming(true)}
                aria-label="Rename credential"
              >
                <Pencil className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
        {item.description && (
          <p className="text-xs text-muted-foreground">{item.description}</p>
        )}
      </div>

      {/* Fields */}
      <div className="space-y-2">
        {item.fields.map((field) => (
          <FieldRow
            key={field.id}
            item={item}
            field={field}
            label={fieldLabels.get(field.field_key) ?? null}
            busy={busy}
            actions={actions}
          />
        ))}
        {item.fields.length === 0 && (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No active fields on this credential.
          </p>
        )}
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        {caps.can_edit && (
          <ActionToggle
            panel="add-field"
            current={panel}
            setPanel={setPanel}
            icon={Plus}
            label="Add field"
          />
        )}
        {caps.can_edit && item.fields.length > 0 && (
          <ActionToggle
            panel="rotate"
            current={panel}
            setPanel={setPanel}
            icon={RotateCcw}
            label="Rotate"
          />
        )}
        {caps.can_manage && (
          <ActionToggle
            panel="share"
            current={panel}
            setPanel={setPanel}
            icon={Users}
            label="Share"
          />
        )}
        {caps.can_manage && (
          <ActionToggle
            panel="transfer"
            current={panel}
            setPanel={setPanel}
            icon={ArrowLeftRight}
            label="Transfer"
          />
        )}
        {caps.can_use && (
          <ActionToggle
            panel="fork"
            current={panel}
            setPanel={setPanel}
            icon={GitFork}
            label="Copy as independent"
          />
        )}
        <ActionToggle
          panel="audit"
          current={panel}
          setPanel={setPanel}
          icon={History}
          label="Audit"
        />
        {caps.can_manage && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            Delete
          </Button>
        )}
      </div>

      {panel === "add-field" && (
        <AddFieldPanel
          busy={busy}
          onAdd={async (field) => {
            await actions.addField(item.id, field);
            setPanel("none");
          }}
        />
      )}
      {panel === "rotate" && (
        <RotatePanel
          item={item}
          fieldLabels={fieldLabels}
          busy={busy}
          onRotate={async (values) => {
            await actions.rotate(item.id, values);
            setPanel("none");
          }}
        />
      )}
      {panel === "share" && (
        <SharePanel
          item={item}
          busy={busy}
          onShare={async (mode, userIds) => {
            await actions.share(item.id, mode, userIds);
            setPanel("none");
          }}
        />
      )}
      {panel === "transfer" && (
        <TransferPanel
          item={item}
          busy={busy}
          onTransfer={async (to) => {
            await actions.transfer(item.id, to);
            setPanel("none");
          }}
        />
      )}
      {panel === "fork" && (
        <ForkPanel
          item={item}
          busy={busy}
          onFork={async (to) => {
            await actions.fork(item.id, to);
            setPanel("none");
          }}
        />
      )}
      {panel === "audit" && <AuditPanel itemId={item.id} />}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmDelete(false);
        }}
        title="Delete credential"
        description={
          <>
            Delete <b>{item.display_name}</b>? Executions and sandboxes that
            depend on it will stop resolving its values immediately.
          </>
        }
        confirmLabel="Delete credential"
        variant="destructive"
        busy={busy}
        onConfirm={async () => {
          await actions.deleteItem(item.id);
          setConfirmDelete(false);
          onClose();
        }}
      />
    </div>
  );
}

function ActionToggle({
  panel,
  current,
  setPanel,
  icon: Icon,
  label,
}: {
  panel: Panel;
  current: Panel;
  setPanel: (p: Panel) => void;
  icon: typeof Plus;
  label: string;
}) {
  return (
    <Button
      size="sm"
      variant={current === panel ? "secondary" : "ghost"}
      onClick={() => setPanel(current === panel ? "none" : panel)}
    >
      <Icon className="mr-1.5 h-3.5 w-3.5" />
      {label}
    </Button>
  );
}

// ── One field row: hint, handling, reveal/copy, edit value, inject ────────

function FieldRow({
  item,
  field,
  label,
  busy,
  actions,
}: {
  item: VaultItem;
  field: VaultField;
  label: string | null;
  busy: boolean;
  actions: VaultActions;
}) {
  const caps = item.capabilities;
  const revealed = useTransientSecret();
  const [revealing, setRevealing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [valueDraft, setValueDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [envDraft, setEnvDraft] = useState(field.env_key ?? "");
  const [descDraft, setDescDraft] = useState(field.description ?? "");
  const [confirmSeal, setConfirmSeal] = useState(false);

  const canShow =
    field.handling === "visible"
      ? caps.can_use
      : field.handling === "revealable"
        ? caps.can_reveal
        : false;

  const show = async () => {
    setRevealing(true);
    try {
      // `visible` resolves under can_use; `revealable` uses the audited
      // reveal endpoint under can_reveal. `sealed` has no human path.
      const value =
        field.handling === "visible"
          ? (await resolveVaultFields([
              { item_id: item.id, field_key: field.field_key },
            ]))[`${item.id}/${field.field_key}`]
          : (await revealVaultField(item.id, field.field_key)).value;
      if (typeof value !== "string") throw new Error("No value returned");
      revealed.hold(value);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setRevealing(false);
    }
  };

  const copyValue = async () => {
    let value = revealed.value;
    if (value === null) {
      setRevealing(true);
      try {
        value =
          field.handling === "visible"
            ? ((await resolveVaultFields([
                { item_id: item.id, field_key: field.field_key },
              ]))[`${item.id}/${field.field_key}`] ?? null)
            : (await revealVaultField(item.id, field.field_key)).value;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
        return;
      } finally {
        setRevealing(false);
      }
    }
    if (value === null) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <code className="text-xs font-semibold">
          {label ?? field.env_key ?? field.field_key}
        </code>
        {field.env_key && field.env_key !== (label ?? field.field_key) && (
          <code className="text-xs text-muted-foreground">{field.env_key}</code>
        )}
        <Badge variant="outline" className="gap-1 font-normal">
          {field.handling === "sealed" && <Lock className="h-3 w-3" />}
          {HANDLING_LABELS[field.handling] ?? field.handling}
        </Badge>
        {!field.editable && (
          <Badge variant="outline" className="font-normal">
            Managed
          </Badge>
        )}
        {field.inject_into_sandbox && (
          <Badge variant="outline" className="font-normal">
            Sandbox
          </Badge>
        )}
      </div>

      <div className="mt-1.5 flex items-center gap-1.5">
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
          {revealed.value ?? field.value_hint ?? "•••"}
        </p>
        {canShow && (
          <>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              disabled={revealing}
              onClick={() => (revealed.value !== null ? revealed.clear() : void show())}
              aria-label={revealed.value !== null ? "Hide value" : "Show value"}
            >
              {revealing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : revealed.value !== null ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              disabled={revealing}
              onClick={() => void copyValue()}
              aria-label="Copy value"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </>
        )}
        {caps.can_edit && field.editable && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            onClick={() => setEditing((v) => !v)}
            aria-label="Edit value"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {caps.can_edit && (
          <Button
            size="icon"
            variant={metaOpen ? "secondary" : "ghost"}
            className="h-7 w-7 shrink-0"
            onClick={() => setMetaOpen((v) => !v)}
            aria-label="Field settings"
          >
            <Settings2 className="h-3.5 w-3.5" />
          </Button>
        )}
        {caps.can_edit && (
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            disabled={busy}
            onClick={() => void actions.deleteField(item.id, field.id)}
            aria-label="Delete field"
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        )}
      </div>

      {field.description && (
        <p className="mt-1 text-xs text-muted-foreground">{field.description}</p>
      )}

      {editing && (
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="password"
            value={valueDraft}
            onChange={(e) => setValueDraft(e.target.value)}
            placeholder="New value"
            className="h-8 font-mono text-xs"
            autoComplete="off"
          />
          <Button
            size="sm"
            disabled={busy || !valueDraft}
            onClick={async () => {
              await actions.updateFieldValue(item.id, field.id, valueDraft);
              setValueDraft("");
              setEditing(false);
              revealed.clear();
            }}
          >
            Save
          </Button>
        </div>
      )}

      {caps.can_edit && (
        <label className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          Inject into sandboxes{field.env_key ? "" : " (needs an env key)"}
          <Switch
            checked={field.inject_into_sandbox}
            disabled={busy}
            onCheckedChange={(checked) =>
              void actions.setInject(item.id, field.id, checked)
            }
            aria-label="Inject into sandboxes"
          />
        </label>
      )}

      {metaOpen && caps.can_edit && (
        <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-2.5">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs">Env key</Label>
              <Input
                value={envDraft}
                onChange={(e) => setEnvDraft(e.target.value)}
                placeholder="MY_API_KEY"
                className="h-8 font-mono text-xs"
                aria-invalid={Boolean(envDraft) && !VALID_KEY_RE.test(envDraft)}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={
                busy ||
                (Boolean(envDraft) && !VALID_KEY_RE.test(envDraft)) ||
                envDraft === (field.env_key ?? "")
              }
              onClick={() =>
                void actions.updateFieldMeta(
                  item.id,
                  field.id,
                  envDraft
                    ? { env_key: envDraft }
                    : { clear_env_key: true },
                )
              }
            >
              {envDraft ? "Save" : "Clear"}
            </Button>
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <Label className="text-xs">Description</Label>
              <Input
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                placeholder="What is this field?"
                className="h-8 text-xs"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || descDraft === (field.description ?? "")}
              onClick={() =>
                void actions.updateFieldMeta(item.id, field.id, {
                  description: descDraft || null,
                })
              }
            >
              Save
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Active
              <Switch
                checked={field.is_active}
                disabled={busy}
                onCheckedChange={(checked) =>
                  void actions.updateFieldMeta(item.id, field.id, {
                    is_active: checked,
                  })
                }
                aria-label="Field active"
              />
            </label>
            {field.handling === "sealed" ? (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                Sealed — can never be shown to a human again
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Handling</Label>
                <Select
                  value={field.handling}
                  onValueChange={(next) => {
                    if (next === field.handling) return;
                    if (next === "sealed") {
                      setConfirmSeal(true);
                      return;
                    }
                    void actions.updateFieldMeta(item.id, field.id, {
                      handling: next as "visible" | "revealable",
                    });
                  }}
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
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmSeal}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmSeal(false);
        }}
        title="Seal this value"
        description={
          <>
            Sealing <b>{field.env_key ?? field.field_key}</b> cannot be undone
            — sealed values can never be shown to a human again. Trusted
            server execution can still use them.
          </>
        }
        confirmLabel="Seal permanently"
        variant="destructive"
        busy={busy}
        onConfirm={async () => {
          await actions.updateFieldMeta(item.id, field.id, {
            handling: "sealed",
          });
          revealed.clear();
          setConfirmSeal(false);
        }}
      />
    </div>
  );
}

// ── Add field ─────────────────────────────────────────────────────────────

function AddFieldPanel({
  busy,
  onAdd,
}: {
  busy: boolean;
  onAdd: (field: {
    field_key: string;
    value: string;
    env_key: string | null;
    handling: VaultHandling;
    editable: boolean;
    inject_into_sandbox: boolean;
    description: string | null;
  }) => Promise<void>;
}) {
  const [fieldKey, setFieldKey] = useState("");
  const [value, setValue] = useState("");
  const [envKey, setEnvKey] = useState("");
  const [handling, setHandling] = useState<VaultHandling>("revealable");
  const [inject, setInject] = useState(false);

  const valid =
    FIELD_KEY_RE.test(fieldKey) &&
    value.length > 0 &&
    (!envKey || VALID_KEY_RE.test(envKey));

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Field key</Label>
          <Input
            value={fieldKey}
            onChange={(e) => setFieldKey(e.target.value.toLowerCase())}
            placeholder="api_key"
            className="h-8 font-mono text-xs"
            aria-invalid={Boolean(fieldKey) && !FIELD_KEY_RE.test(fieldKey)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Env key (optional)</Label>
          <Input
            value={envKey}
            onChange={(e) => setEnvKey(e.target.value)}
            placeholder="MY_API_KEY"
            className="h-8 font-mono text-xs"
            aria-invalid={Boolean(envKey) && !VALID_KEY_RE.test(envKey)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Value</Label>
        <Input
          type={handling === "visible" ? "text" : "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Paste the value"
          className="h-8 font-mono text-xs"
          autoComplete="off"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Select value={handling} onValueChange={(v) => setHandling(v as VaultHandling)}>
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
            <Switch checked={inject} onCheckedChange={setInject} aria-label="Inject into sandboxes" />
          </label>
        </div>
        <Button
          size="sm"
          disabled={busy || !valid}
          onClick={() =>
            void onAdd({
              field_key: fieldKey,
              value,
              env_key: envKey || null,
              handling,
              editable: true,
              inject_into_sandbox: inject,
              description: null,
            })
          }
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
          Add field
        </Button>
      </div>
    </div>
  );
}

// ── Rotate ────────────────────────────────────────────────────────────────

function RotatePanel({
  item,
  fieldLabels,
  busy,
  onRotate,
}: {
  item: VaultItem;
  fieldLabels: Map<string, string>;
  busy: boolean;
  onRotate: (values: Record<string, string>) => Promise<void>;
}) {
  const editable = item.fields.filter((f) => f.editable);
  const [values, setValues] = useState<Record<string, string>>({});
  const filled = Object.entries(values).filter(([, v]) => v.length > 0);

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">
        Enter new values for the fields you are rotating — untouched fields
        keep their current value. Every consumer of this credential picks up
        the rotation immediately.
      </p>
      {editable.map((field) => (
        <div key={field.id} className="space-y-1">
          <Label className="text-xs">
            {fieldLabels.get(field.field_key) ?? field.env_key ?? field.field_key}
          </Label>
          <Input
            type="password"
            value={values[field.field_key] ?? ""}
            onChange={(e) =>
              setValues((current) => ({ ...current, [field.field_key]: e.target.value }))
            }
            placeholder={field.value_hint || "New value"}
            className="h-8 font-mono text-xs"
            autoComplete="off"
          />
        </div>
      ))}
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={busy || filled.length === 0}
          onClick={() => void onRotate(Object.fromEntries(filled))}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RotateCcw className="mr-2 h-4 w-4" />
          )}
          Rotate {filled.length > 0 ? `${filled.length} field${filled.length === 1 ? "" : "s"}` : ""}
        </Button>
      </div>
    </div>
  );
}

// ── Share (grants) ────────────────────────────────────────────────────────

interface GranteeDraft {
  userId: string;
  label: string;
  canManage: boolean;
}

function SharePanel({
  item,
  busy,
  onShare,
}: {
  item: VaultItem;
  busy: boolean;
  onShare: (mode: VaultAccessMode, grantees: VaultGrantee[]) => Promise<void>;
}) {
  const isOrg = Boolean(item.organization_id);
  const { members } = useOrganizationMembers(item.organization_id ?? undefined);
  const [mode, setMode] = useState<VaultAccessMode>(
    item.access_mode === "restricted" ? "restricted" : "all_members",
  );
  const [grantees, setGrantees] = useState<GranteeDraft[]>([]);
  const [email, setEmail] = useState("");
  const [looking, setLooking] = useState(false);

  const toggleGrantee = (userId: string, label: string, on: boolean) =>
    setGrantees((current) =>
      on
        ? current.some((g) => g.userId === userId)
          ? current
          : [...current, { userId, label, canManage: false }]
        : current.filter((g) => g.userId !== userId),
    );

  const setCanManage = (userId: string, canManage: boolean) =>
    setGrantees((current) =>
      current.map((g) => (g.userId === userId ? { ...g, canManage } : g)),
    );

  const toWire = (): VaultGrantee[] =>
    grantees.map((g) => ({
      user_id: g.userId,
      can_use: true,
      can_manage: g.canManage,
    }));

  const addByEmail = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    setLooking(true);
    try {
      const result = await searchUserByEmail(trimmed);
      if (!result.exists) {
        toast.error(`No account found for ${trimmed}`);
        return;
      }
      toggleGrantee(result.id, result.email, true);
      setEmail("");
    } finally {
      setLooking(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md bg-muted/40 p-3">
      {isOrg ? (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Who can use this credential?</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as VaultAccessMode)}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all_members">All organization members</SelectItem>
                <SelectItem value="restricted">Only selected members</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {mode === "restricted" && (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {members.map((member) => {
                const label =
                  member.user?.displayName || member.user?.email || member.userId;
                const draft = grantees.find((g) => g.userId === member.userId);
                return (
                  <div
                    key={member.userId}
                    className="flex items-center gap-2 rounded border border-border bg-background p-2 text-xs"
                  >
                    <Checkbox
                      checked={Boolean(draft)}
                      onCheckedChange={(checked) =>
                        toggleGrantee(member.userId, label, checked === true)
                      }
                    />
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {draft && (
                      <label className="flex shrink-0 items-center gap-1 text-muted-foreground">
                        <Checkbox
                          checked={draft.canManage}
                          onCheckedChange={(checked) =>
                            setCanManage(member.userId, checked === true)
                          }
                        />
                        Can manage
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Organization admins always retain full access. Saving replaces the
            current grant set.
          </p>
        </>
      ) : (
        <>
          <Label className="text-xs">Grant use of this credential by email</Label>
          <div className="flex items-center gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addByEmail();
                }
              }}
              placeholder="teammate@company.com"
              className="h-8 text-xs"
            />
            <Button size="sm" variant="outline" disabled={looking || !email.trim()} onClick={() => void addByEmail()}>
              {looking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add"}
            </Button>
          </div>
          {grantees.length > 0 && (
            <div className="space-y-1.5">
              {grantees.map((entry) => (
                <div
                  key={entry.userId}
                  className="flex items-center gap-2 rounded border border-border bg-background p-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  <label className="flex shrink-0 items-center gap-1 text-muted-foreground">
                    <Checkbox
                      checked={entry.canManage}
                      onCheckedChange={(checked) =>
                        setCanManage(entry.userId, checked === true)
                      }
                    />
                    Can manage
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleGrantee(entry.userId, entry.label, false)}
                    aria-label={`Remove ${entry.label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            Recipients can use the values in executions without revealing them.
            Saving replaces the current grant set; save with no recipients to
            revoke all grants.
          </p>
        </>
      )}
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={busy || (isOrg && mode === "restricted" && grantees.length === 0)}
          onClick={() =>
            void onShare(
              isOrg ? mode : "restricted",
              isOrg && mode === "all_members" ? [] : toWire(),
            )
          }
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Users className="mr-2 h-4 w-4" />}
          Save access
        </Button>
      </div>
    </div>
  );
}

// ── Transfer / Fork (org picker) ──────────────────────────────────────────

function PrincipalPicker({
  item,
  busy,
  verb,
  note,
  onSubmit,
}: {
  item: VaultItem;
  busy: boolean;
  verb: string;
  note: string;
  onSubmit: (to: VaultPrincipal) => Promise<void>;
}) {
  const { organizations, loading } = useUserOrganizations();
  const targets = organizations.filter(
    (org) => !org.isPersonal && org.id !== item.organization_id,
  );
  const allowPersonal = Boolean(item.organization_id);
  const [target, setTarget] = useState<string>("");

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{note}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger className="h-8 min-w-48 flex-1 text-xs" aria-label="Destination">
            <SelectValue placeholder={loading ? "Loading…" : "Choose a destination"} />
          </SelectTrigger>
          <SelectContent>
            {allowPersonal && <SelectItem value="__personal__">My personal vault</SelectItem>}
            {targets.map((org) => (
              <SelectItem key={org.id} value={org.id}>
                {org.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          disabled={busy || !target}
          onClick={() =>
            void onSubmit(
              target === "__personal__"
                ? { type: "user" }
                : { type: "organization", organizationId: target },
            )
          }
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {verb}
        </Button>
      </div>
    </div>
  );
}

function TransferPanel({
  item,
  busy,
  onTransfer,
}: {
  item: VaultItem;
  busy: boolean;
  onTransfer: (to: VaultPrincipal) => Promise<void>;
}) {
  return (
    <PrincipalPicker
      item={item}
      busy={busy}
      verb="Transfer"
      note="Move ownership without copying values — every existing reference keeps working. Transferring into an organization requires adminhood there."
      onSubmit={onTransfer}
    />
  );
}

function ForkPanel({
  item,
  busy,
  onFork,
}: {
  item: VaultItem;
  busy: boolean;
  onFork: (to: VaultPrincipal) => Promise<void>;
}) {
  return (
    <PrincipalPicker
      item={item}
      busy={busy}
      verb="Create copy"
      note="Create an independent copy whose values can diverge from this one. Use Transfer or Share instead when both sides should stay identical."
      onSubmit={onFork}
    />
  );
}

// ── Audit ─────────────────────────────────────────────────────────────────

function AuditPanel({ itemId }: { itemId: string }) {
  const { entries, loading, error } = useVaultAudit(itemId);

  return (
    <div className="rounded-md bg-muted/40 p-3">
      {loading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading audit trail…
        </div>
      ) : error ? (
        <p className="text-xs text-muted-foreground">
          Audit trail unavailable: {error}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-xs text-muted-foreground">No audit events yet.</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto">
          {entries.map((entry) => (
            <li key={entry.id} className="flex items-baseline gap-2 text-xs">
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {new Date(entry.created_at).toLocaleString()}
              </span>
              <span className="font-medium capitalize">{entry.action.replaceAll("_", " ")}</span>
              {typeof entry.metadata?.["field_key"] === "string" && (
                <code className="text-muted-foreground">
                  {String(entry.metadata["field_key"])}
                </code>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
