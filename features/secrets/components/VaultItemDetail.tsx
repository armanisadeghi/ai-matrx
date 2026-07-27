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
import { useState } from "react";
import {
  ArrowLeftRight,
  Building2,
  Check,
  GitFork,
  Globe,
  History,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
  TriangleAlert,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { cn } from "@/utils/cn";
import { toast } from "@/lib/toast";
import { useUserOrganizations } from "@/features/organizations/hooks";

import { useVaultAudit, useVaultGrants, type VaultActions } from "../vault-hooks";
import { resolveVaultFields } from "../vault-service";
import {
  envAliasIsRedundant,
  fieldLabelOf,
  identityFieldOf,
  primarySecretFieldOf,
} from "../credential-identity";
import { SecretValue } from "./SecretValue";
import {
  FIELD_KEY_RE,
  HANDLING_LABELS,
  PROMOTABLE_URL_FIELD_KEYS,
  URI_MATCH_MODE_LABELS,
  VALID_KEY_RE,
  type CredentialDefinition,
  type UriMatchMode,
  type VaultAccessMode,
  type VaultField,
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

type Panel =
  | "none"
  | "share"
  | "give"
  | "transfer"
  | "fork"
  | "rotate"
  | "add-field"
  | "audit"
  | "destination";

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

  const fieldLabels = new Map<string, string>(
    (definition?.payload.fields ?? []).map((f) => [f.field_key, f.label]),
  );

  // The primary pair leads, exactly as a password manager does: who this signs
  // in as, then the value that protects it. Everything else is subordinate.
  const identityField = identityFieldOf(item);
  const secretField = primarySecretFieldOf(item);
  const primaryIds = new Set(
    [identityField?.id, secretField?.id].filter((id): id is string => Boolean(id)),
  );
  const otherFields = item.fields.filter((f) => !primaryIds.has(f.id));

  const renderField = (field: VaultField, emphasis: boolean) => (
    <FieldRow
      key={field.id}
      item={item}
      field={field}
      label={fieldLabels.get(field.field_key) ?? null}
      emphasis={emphasis}
      busy={busy}
      actions={actions}
    />
  );

  const allOverflowActions: {
    key: Panel;
    icon: typeof Plus;
    label: string;
    show: boolean;
  }[] = [
    {
      key: "transfer",
      icon: ArrowLeftRight,
      label: "Move scope",
      show: caps.can_manage === true,
    },
    {
      key: "give",
      icon: UserPlus,
      label: "Give ownership",
      show: caps.can_manage === true && Boolean(item.user_id),
    },
    {
      key: "fork",
      icon: GitFork,
      label: "Copy as independent",
      show: caps.can_use === true,
    },
    { key: "audit", icon: History, label: "Audit trail", show: true },
  ];
  const overflowActions = allOverflowActions.filter((entry) => entry.show);

  return (
    <div className="space-y-3">
      {/* Header metadata — the name and type live in the dialog title, so this
          row carries only what the title cannot: provenance and lifecycle. */}
      {renaming ? (
        <div className="flex items-center gap-2">
          <Input
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            className="h-9"
            autoFocus
          />
          <Button
            size="icon"
            className="h-9 w-9 shrink-0"
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
            className="h-9 w-9 shrink-0"
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
        (item.provider_key ||
          item.status !== "active" ||
          item.organization_id ||
          item.description ||
          caps.can_edit) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {item.provider_key && (
              <Badge variant="outline" className="font-normal">
                {item.provider_key}
              </Badge>
            )}
            {item.status !== "active" && (
              <Badge
                variant="outline"
                className="border-warning/40 font-normal capitalize text-warning"
              >
                {item.status.replaceAll("_", " ")}
              </Badge>
            )}
            {item.organization_id && (
              <Badge variant="outline" className="gap-1 font-normal">
                <Building2 className="h-3 w-3" />
                {item.access_mode === "all_members" ? "All members" : "Restricted"}
              </Badge>
            )}
            {item.description && (
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {item.description}
              </span>
            )}
            {caps.can_edit && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7 px-2 text-xs text-muted-foreground"
                onClick={() => setRenaming(true)}
              >
                <Pencil className="mr-1.5 h-3 w-3" />
                Rename
              </Button>
            )}
          </div>
        )
      )}

      {/* The credential itself — always first, always the loudest thing here */}
      {item.fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No active fields on this credential.
        </p>
      ) : (
        <div className="space-y-1.5">
          {identityField && renderField(identityField, true)}
          {secretField && renderField(secretField, true)}
          {otherFields.length > 0 && (
            <div className="space-y-1.5 pt-1.5">
              {primaryIds.size > 0 && (
                <p className="px-0.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Other fields
                </p>
              )}
              {otherFields.map((field) => renderField(field, false))}
            </div>
          )}
        </div>
      )}

      {/* Destination — after the credential, because for an API key it is a
          footnote and only for a website login is it part of the identity. */}
      <DestinationSection item={item} busy={busy} actions={actions} caps={caps} />

      {/* Notes and other details — deliberately plaintext, loudly labelled */}
      <NotEncryptedSection
        item={item}
        busy={busy}
        actions={actions}
        canEdit={caps.can_edit === true}
      />

      {/* Action bar — the three everyday actions stay in reach; the rare and
          irreversible ones live one deliberate click away. */}
      <div className="flex flex-wrap items-center gap-1 border-t border-border pt-3">
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
        {overflowActions.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8">
                <MoreHorizontal className="mr-1.5 h-4 w-4" />
                More
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {overflowActions.map(({ key, icon: Icon, label }) => (
                <DropdownMenuItem
                  key={key}
                  onSelect={() => setPanel(panel === key ? "none" : key)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {caps.can_manage && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" />
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
        <SharePanel item={item} busy={busy} actions={actions} />
      )}
      {panel === "give" && (
        <GiveOwnershipPanel
          item={item}
          busy={busy}
          onGive={actions.giveOwnership}
          onDone={() => {
            setPanel("none");
            onClose();
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
  const active = current === panel;
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-pressed={active}
      className={cn("h-8", active && "bg-accent text-accent-foreground")}
      onClick={() => setPanel(active ? "none" : panel)}
    >
      <Icon className="mr-1.5 h-4 w-4" />
      {label}
    </Button>
  );
}

// ── One field row: hint, handling, reveal/copy, edit value, inject ────────

function FieldRow({
  item,
  field,
  label,
  emphasis,
  busy,
  actions,
}: {
  item: VaultItem;
  field: VaultField;
  label: string | null;
  /** Part of the primary pair — the username/secret a person came here for. */
  emphasis: boolean;
  busy: boolean;
  actions: VaultActions;
}) {
  const caps = item.capabilities;
  const [editing, setEditing] = useState(false);
  const [valueDraft, setValueDraft] = useState("");
  const [metaOpen, setMetaOpen] = useState(false);
  const [envDraft, setEnvDraft] = useState(field.env_key ?? "");
  const [descDraft, setDescDraft] = useState(field.description ?? "");
  const [confirmSeal, setConfirmSeal] = useState(false);

  const displayLabel = fieldLabelOf(field, label);
  const showEnvAlias = !envAliasIsRedundant(field);

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        emphasis
          ? "border-border bg-card px-3 py-2.5"
          : "border-border/70 bg-card/50 px-3 py-2",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            "min-w-0 truncate font-medium",
            emphasis ? "text-[13px] text-foreground" : "text-xs text-muted-foreground",
          )}
        >
          {displayLabel}
        </span>
        {showEnvAlias && (
          <code className="shrink-0 rounded bg-muted px-1 py-px font-mono text-[11px] text-muted-foreground">
            {field.env_key}
          </code>
        )}
        {/* `revealable` is the default and needs no chip — only the states
            that change what a human may do with the value are called out. */}
        {field.handling === "visible" && (
          <Badge variant="outline" className="shrink-0 font-normal">
            {HANDLING_LABELS.visible}
          </Badge>
        )}
        {!field.editable && (
          <Badge variant="outline" className="shrink-0 font-normal">
            Managed
          </Badge>
        )}
        {field.inject_into_sandbox && (
          <Badge variant="outline" className="shrink-0 font-normal">
            Sandbox
          </Badge>
        )}

        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          {caps.can_edit && field.editable && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setEditing((v) => !v)}
              aria-label={`Replace ${displayLabel}`}
              title="Replace value"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {caps.can_edit && (
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "h-7 w-7 text-muted-foreground hover:text-foreground",
                metaOpen && "bg-accent text-accent-foreground",
              )}
              aria-pressed={metaOpen}
              onClick={() => setMetaOpen((v) => !v)}
              aria-label={`Settings for ${displayLabel}`}
              title="Field settings"
            >
              <Settings2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {caps.can_edit && (
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              disabled={busy}
              onClick={() => void actions.deleteField(item.id, field.id)}
              aria-label={`Delete ${displayLabel}`}
              title="Delete field"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </span>
      </div>

      {/* THE control — identical here, on the list card, and anywhere else a
          value is shown. Masked until asked; sealed shows a lock and nothing. */}
      <SecretValue
        item={item}
        field={field}
        showCountdown
        className={cn("mt-0.5", emphasis && "mt-1")}
      />

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
            className="h-9 font-mono text-sm"
            autoComplete="off"
          />
          <Button
            size="sm"
            className="h-9"
            disabled={busy || !valueDraft}
            onClick={async () => {
              await actions.updateFieldValue(item.id, field.id, valueDraft);
              setValueDraft("");
              setEditing(false);
            }}
          >
            Save
          </Button>
        </div>
      )}

      {metaOpen && caps.can_edit && (
        <div className="mt-2 space-y-2 rounded-md bg-muted/40 p-2.5">
          {/* A sandbox env is a NAME->value map: with no env key the value has
              nowhere to land, so injection is impossible rather than merely
              unconfigured. The server refuses that state outright (422); the
              switch is disabled here so the user is pointed at the fix — set
              an env key below — instead of hitting an error. Flipping this on
              used to "succeed" and silently do nothing forever. */}
          <label
            className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
            title={
              field.env_key
                ? undefined
                : "Set an env key below first — a sandbox variable needs a name."
            }
          >
            Inject into sandboxes{field.env_key ? "" : " (set an env key first)"}
            <Switch
              checked={field.inject_into_sandbox}
              disabled={busy || !field.env_key}
              onCheckedChange={(checked) =>
                void actions.setInject(item.id, field.id, checked)
              }
              aria-label="Inject into sandboxes"
            />
          </label>
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
          // No explicit clear needed: `SecretValue` drops any held plaintext
          // the moment the field stops being showable.
          await actions.updateFieldMeta(item.id, field.id, {
            handling: "sealed",
          });
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
          <label
            className="flex items-center gap-2 text-xs text-muted-foreground"
            title={
              envKey
                ? undefined
                : "Sandbox injection needs an env key — a container variable must have a name."
            }
          >
            Sandbox
            <Switch
              checked={inject && Boolean(envKey)}
              disabled={!envKey}
              onCheckedChange={setInject}
              aria-label="Inject into sandboxes"
            />
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
              // Never send an impossible combination: without an env key the
              // server refuses injection (it could never take effect).
              inject_into_sandbox: inject && Boolean(envKey),
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

// ── Destination (plaintext URLs + browser fill) ───────────────────────────

/**
 * Where this login lives and whether Matrx Extend may fill it.
 *
 * These URLs are PLAINTEXT metadata by design — the browser matcher has to
 * see them, and a value nobody can read cannot be matched against a page.
 * The server re-checks every match before it decrypts anything.
 */
function DestinationSection({
  item,
  busy,
  actions,
  caps,
}: {
  item: VaultItem;
  busy: boolean;
  actions: VaultActions;
  caps: VaultItem["capabilities"];
}) {
  const [adding, setAdding] = useState(false);
  const [urlDraft, setUrlDraft] = useState("");
  const [promoting, setPromoting] = useState<string | null>(null);

  // Definitions that predate destination-login keep their URL in an ENCRYPTED
  // field, which the matcher can never see. Offer a one-click promotion
  // instead of asking the user to retype it — with the declassification said
  // out loud.
  const promotable = item.fields.filter(
    (f) =>
      (PROMOTABLE_URL_FIELD_KEYS as readonly string[]).includes(f.field_key) &&
      f.is_active &&
      f.handling !== "sealed",
  );

  const addUrl = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    await actions.updateItem(item.id, {
      login_urls: [...item.login_urls, trimmed],
    });
    setUrlDraft("");
    setAdding(false);
  };

  const removeUrl = async (url: string) => {
    await actions.updateItem(item.id, {
      login_urls: item.login_urls.filter((u) => u !== url),
    });
  };

  const promote = async (field: VaultField) => {
    setPromoting(field.id);
    try {
      const values = await resolveVaultFields([
        { item_id: item.id, field_key: field.field_key },
      ]);
      const url = values[`${item.id}/${field.field_key}`];
      if (!url) {
        toast.error("Could not read that field's value");
        return;
      }
      if (item.login_urls.includes(url)) {
        toast.info("That URL is already a login URL");
        return;
      }
      await actions.updateItem(item.id, {
        login_urls: [...item.login_urls, url],
      });
      toast.success("Login URL added — this item can now be matched in the browser");
    } finally {
      setPromoting(null);
    }
  };

  const hasDestination = item.login_urls.length > 0;
  if (!hasDestination && !caps.can_edit && promotable.length === 0) return null;

  // An API key or an env value has no destination and never will. Showing it a
  // full card — above the credential, as this used to — buried the thing the
  // user actually opened the item for. Until there IS a destination, it is one
  // quiet line.
  if (!hasDestination && promotable.length === 0 && !adding) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => setAdding(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-60"
      >
        <Globe className="h-3.5 w-3.5 shrink-0" />
        Add a login URL to let Matrx fill this login in a browser
        <Plus className="ml-auto h-3.5 w-3.5 shrink-0" />
      </button>
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold">Destination</p>
      </div>

      {hasDestination ? (
        <ul className="space-y-1">
          {item.login_urls.map((url) => (
            <li
              key={url}
              className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1 text-xs"
            >
              <span className="min-w-0 flex-1 truncate font-mono">{url}</span>
              {caps.can_edit && (
                <button
                  type="button"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  disabled={busy}
                  onClick={() => void removeUrl(url)}
                  aria-label={`Remove ${url}`}
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No login URL yet. Without one, Matrx can never fill this login in a
          browser.
        </p>
      )}

      {caps.can_edit && (
        <>
          {adding ? (
            <div className="flex items-center gap-2">
              <Input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addUrl(urlDraft);
                  }
                }}
                placeholder="https://example.com/login"
                className="h-7 text-xs"
                autoFocus
              />
              <Button
                size="sm"
                className="h-7"
                disabled={busy || !urlDraft.trim()}
                onClick={() => void addUrl(urlDraft)}
              >
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7"
                onClick={() => {
                  setAdding(false);
                  setUrlDraft("");
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => setAdding(true)}
              disabled={busy}
            >
              <Plus className="mr-1.5 h-3 w-3" />
              Add login URL
            </Button>
          )}

          {promotable.map((field) => (
            <div
              key={field.id}
              className="rounded border border-dashed border-border p-2 text-xs"
            >
              <p className="text-muted-foreground">
                This item stores its address in the encrypted field{" "}
                <span className="font-mono">{field.field_key}</span>, which the
                browser matcher cannot read. Use it as a login URL to make it
                fillable — the address becomes visible, unencrypted metadata.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-1.5 h-7"
                disabled={busy || promoting === field.id}
                onClick={() => void promote(field)}
              >
                {promoting === field.id ? (
                  <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                ) : (
                  <Globe className="mr-1.5 h-3 w-3" />
                )}
                Use as login URL
              </Button>
            </div>
          ))}

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">When it matches</Label>
              <Select
                value={item.uri_match_mode}
                onValueChange={(v) =>
                  void actions.updateItem(item.id, { uri_match_mode: v as UriMatchMode })
                }
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(URI_MATCH_MODE_LABELS) as UriMatchMode[]).map(
                    (mode) => (
                      <SelectItem key={mode} value={mode}>
                        {URI_MATCH_MODE_LABELS[mode]}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-end gap-2 pb-1">
              <Switch
                checked={item.browser_fill_enabled}
                disabled={busy || !hasDestination}
                onCheckedChange={(checked) =>
                  void actions.updateItem(item.id, {
                    browser_fill_enabled: checked,
                  })
                }
              />
              <span className="text-xs">
                Let Matrx fill this login in the browser
              </span>
            </label>
          </div>
          {!hasDestination && (
            <p className="text-xs text-muted-foreground">
              Add a login URL to enable browser fill.
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Not encrypted (plaintext notes + custom fields) ───────────────────────

/**
 * The deliberately-plaintext section. It is visually separate and labelled
 * loudly because the one failure mode that matters here is a user typing a
 * password into "notes" and believing it is protected.
 */
function NotEncryptedSection({
  item,
  busy,
  actions,
  canEdit,
}: {
  item: VaultItem;
  busy: boolean;
  actions: VaultActions;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.notes ?? "");

  const hasContent = Boolean(item.notes) || item.non_secret_fields.length > 0;
  if (!hasContent && !canEdit) return null;

  return (
    <div className="space-y-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
      <div className="flex items-center gap-2">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning" />
        <p className="text-xs font-semibold">Notes and other details</p>
        <Badge
          variant="outline"
          className="border-warning/40 text-[10px] font-medium text-warning"
        >
          Not encrypted
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Do not put passwords, tokens, recovery codes, or other secrets here.
      </p>

      {item.non_secret_fields.length > 0 && (
        <dl className="space-y-1">
          {item.non_secret_fields.map((entry) => (
            <div
              key={entry.key}
              className="flex items-baseline gap-2 rounded border border-border bg-background px-2 py-1 text-xs"
            >
              <dt className="shrink-0 text-muted-foreground">{entry.label}</dt>
              <dd className="min-w-0 flex-1 truncate">{entry.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {editing ? (
        <div className="space-y-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            className="w-full rounded border border-border bg-background p-2 text-xs"
            placeholder="Anything that is not a secret — account numbers, support contacts, reminders."
          />
          <div className="flex justify-end gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                setDraft(item.notes ?? "");
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7"
              disabled={busy}
              onClick={async () => {
                const next = draft.trim();
                await actions.updateItem(
                  item.id,
                  next ? { notes: next } : { clear_notes: true },
                );
                setEditing(false);
              }}
            >
              Save notes
            </Button>
          </div>
        </div>
      ) : (
        <>
          {item.notes ? (
            <p className="whitespace-pre-wrap rounded border border-border bg-background p-2 text-xs">
              {item.notes}
            </p>
          ) : (
            canEdit && (
              <p className="text-xs text-muted-foreground">No notes yet.</p>
            )
          )}
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => {
                setDraft(item.notes ?? "");
                setEditing(true);
              }}
            >
              <Pencil className="mr-1.5 h-3 w-3" />
              {item.notes ? "Edit notes" : "Add notes"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// ── Share (grants) ────────────────────────────────────────────────────────

/**
 * The access list. It LOADS the current recipients first and then mutates ONE
 * grant at a time — adding, changing, or revoking a person never touches
 * anybody else. (The previous panel initialized empty and saved a replacement
 * set, so pressing Save silently revoked every recipient it had not seen.)
 */
function SharePanel({
  item,
  busy,
  actions,
}: {
  item: VaultItem;
  busy: boolean;
  actions: VaultActions;
}) {
  const isOrg = Boolean(item.organization_id);
  const { grants, loading, error, reload } = useVaultGrants(item.id);
  const [mode, setMode] = useState<VaultAccessMode>(
    item.access_mode === "restricted" ? "restricted" : "all_members",
  );
  const [email, setEmail] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const addRecipient = async () => {
    const trimmed = email.trim();
    if (!trimmed) return;
    await actions.addGrant(item.id, {
      recipient_email: trimmed,
      can_use: true,
      can_manage: canManage,
    });
    setEmail("");
    setCanManage(false);
    await reload();
  };

  const showRecipients = !isOrg || mode === "restricted";

  return (
    <div className="space-y-3 rounded-md bg-muted/40 p-3">
      {isOrg && (
        <div className="space-y-1.5">
          <Label className="text-xs">Who can use this credential?</Label>
          <Select
            value={mode}
            onValueChange={(v) => {
              const next = v as VaultAccessMode;
              setMode(next);
              void actions.setAccessMode(item.id, next);
            }}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all_members">All organization members</SelectItem>
              <SelectItem value="restricted">Only selected members</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Organization admins always retain full access.
            {mode === "all_members" &&
              " Switching to all members clears the individual list below."}
          </p>
        </div>
      )}

      {showRecipients && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs" htmlFor={`share-email-${item.id}`}>
              Share with a person by their exact email
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id={`share-email-${item.id}`}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addRecipient();
                  }
                }}
                placeholder="teammate@company.com"
                className="h-8 text-xs"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !email.trim()}
                onClick={() => void addRecipient()}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Share"}
              </Button>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Checkbox
                checked={canManage}
                onCheckedChange={(checked) => setCanManage(checked === true)}
              />
              Let them reveal and edit values
            </label>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">People with access</Label>
            {loading ? (
              <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading current access…
              </div>
            ) : error ? (
              <p className="rounded border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
                {error}
              </p>
            ) : grants.length === 0 ? (
              <p className="rounded border border-dashed border-border p-2 text-xs text-muted-foreground">
                Only you. Add someone above to share this credential.
              </p>
            ) : (
              grants.map((grant) => (
                <div
                  key={grant.id}
                  className="flex items-center gap-2 rounded border border-border bg-background p-2 text-xs"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {grant.email || grant.user_id}
                  </span>
                  <label className="flex shrink-0 items-center gap-1 text-muted-foreground">
                    <Checkbox
                      checked={Boolean(grant.can_manage)}
                      disabled={busy || pendingId === grant.id}
                      onCheckedChange={async (checked) => {
                        setPendingId(grant.id);
                        try {
                          await actions.updateGrant(item.id, grant.id, {
                            can_manage: checked === true,
                          });
                          await reload();
                        } finally {
                          setPendingId(null);
                        }
                      }}
                    />
                    Can reveal &amp; edit
                  </label>
                  <button
                    type="button"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    disabled={busy || pendingId === grant.id}
                    onClick={async () => {
                      setPendingId(grant.id);
                      try {
                        await actions.removeGrant(item.id, grant.id);
                        await reload();
                      } finally {
                        setPendingId(null);
                      }
                    }}
                    aria-label={`Revoke access for ${grant.email || grant.user_id}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Everyone here can use this login with agents and autofill, and sees
            the username. Only people with &ldquo;Can reveal &amp; edit&rdquo;
            can show the password. Revoking takes effect immediately. Changes
            save as you make them — one person at a time, never the whole list.
          </p>
        </>
      )}
    </div>
  );
}

// ── Give ownership (cross-user transfer) ──────────────────────────────────

/**
 * Handing the item to another person. This is NOT sharing: the sender loses
 * all future access, and the product says so plainly rather than implying the
 * recipient can be un-told a password they may already have seen.
 */
function GiveOwnershipPanel({
  item,
  busy,
  onGive,
  onDone,
}: {
  item: VaultItem;
  busy: boolean;
  onGive: (itemId: string, email: string) => Promise<unknown>;
  onDone: () => void;
}) {
  const [email, setEmail] = useState("");
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-3 rounded-md bg-muted/40 p-3">
      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor={`give-email-${item.id}`}>
          Give ownership to (exact email)
        </Label>
        <Input
          id={`give-email-${item.id}`}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@company.com"
          className="h-8 text-xs"
        />
      </div>
      <div className="rounded-md border border-warning/30 bg-warning/5 p-2.5 text-xs">
        <p className="flex items-center gap-1.5 font-medium text-foreground">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-warning" />
          You will lose access to this credential.
        </p>
        <p className="mt-1 text-muted-foreground">
          It moves to their vault, everyone you shared it with loses access, and
          you will not be able to view, reveal, or use it again. If you have
          already seen the password, transferring cannot un-see it — rotate the
          password afterwards if that matters.
        </p>
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="destructive"
          disabled={busy || !email.trim()}
          onClick={() => setConfirming(true)}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <ArrowLeftRight className="mr-2 h-4 w-4" />
          )}
          Give ownership
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Give ownership away?"
        description={`${item.display_name} moves to ${email.trim()}. You will lose all access immediately and every existing share is revoked.`}
        confirmLabel="Give ownership"
        variant="destructive"
        onConfirm={async () => {
          await onGive(item.id, email.trim());
          setConfirming(false);
          onDone();
        }}
      />
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
