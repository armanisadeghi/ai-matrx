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
  Download,
  FileKey2,
  GitFork,
  Globe,
  History,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  TriangleAlert,
  Upload,
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
import { sanitizeFieldName } from "@/utils/user-table-utls/field-name-sanitizer";

import {
  useVaultAudit,
  useVaultGrants,
  type VaultActions,
} from "../vault-hooks";
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
  VAULT_LABELS,
  WEBSITE_LOGIN_DEFINITION_KEY,
  type CredentialDefinition,
  type UriMatchMode,
  type VaultAccessMode,
  type VaultAttachment,
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

type Panel = "none" | "share" | "give" | "transfer" | "fork" | "audit";

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
  const [editingCredential, setEditingCredential] = useState(false);
  const [nameDraft, setNameDraft] = useState(item.display_name);
  const [descriptionDraft, setDescriptionDraft] = useState(
    item.description ?? "",
  );

  const fieldLabels = new Map<string, string>(
    (definition?.payload.fields ?? []).map((f) => [f.field_key, f.label]),
  );

  // The primary pair leads, exactly as a password manager does: who this signs
  // in as, then the value that protects it. Everything else is subordinate.
  const identityField = identityFieldOf(item);
  const secretField = primarySecretFieldOf(item);
  const primaryIds = new Set(
    [identityField?.id, secretField?.id].filter((id): id is string =>
      Boolean(id),
    ),
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
      editMode={editingCredential}
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <dl className="grid min-w-0 flex-1 gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-medium text-muted-foreground">
              {VAULT_LABELS.credentialType}
            </dt>
            <dd className="mt-0.5 whitespace-normal break-words text-foreground">
              {definition?.payload.label ?? item.definition_key}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground">Status</dt>
            <dd className="mt-0.5 capitalize text-foreground">
              {item.status.replaceAll("_", " ")}
            </dd>
          </div>
          {item.organization_id && (
            <div>
              <dt className="font-medium text-muted-foreground">
                {VAULT_LABELS.access}
              </dt>
              <dd className="mt-0.5 text-foreground">
                {item.access_mode === "all_members"
                  ? "All organization members"
                  : "Only selected members"}
              </dd>
            </div>
          )}
          {item.description && !editingCredential && (
            <div className="sm:col-span-2">
              <dt className="font-medium text-muted-foreground">
                {VAULT_LABELS.description}
              </dt>
              <dd className="mt-0.5 whitespace-pre-wrap break-words text-foreground">
                {item.description}
              </dd>
            </div>
          )}
        </dl>
        {caps.can_edit && (
          <Button
            size="sm"
            variant={editingCredential ? "default" : "outline"}
            className="h-8 shrink-0"
            onClick={() => {
              setNameDraft(item.display_name);
              setDescriptionDraft(item.description ?? "");
              setEditingCredential((current) => !current);
            }}
          >
            {editingCredential ? (
              <Check className="mr-1.5 h-3.5 w-3.5" />
            ) : (
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
            )}
            {editingCredential ? "Done editing" : "Edit credential"}
          </Button>
        )}
      </div>

      {editingCredential && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-semibold">Credential details</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`credential-name-${item.id}`}>
                {VAULT_LABELS.credentialName}
              </Label>
              <Input
                id={`credential-name-${item.id}`}
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor={`credential-description-${item.id}`}>
                {VAULT_LABELS.description}
              </Label>
              <Input
                id={`credential-description-${item.id}`}
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                placeholder="What is this credential used for?"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={
                busy ||
                !nameDraft.trim() ||
                (nameDraft.trim() === item.display_name &&
                  descriptionDraft.trim() === (item.description ?? ""))
              }
              onClick={() =>
                void actions.updateItem(item.id, {
                  display_name: nameDraft.trim(),
                  description: descriptionDraft.trim() || null,
                })
              }
            >
              Save credential details
            </Button>
          </div>
        </div>
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
      {editingCredential && (
        <AddFieldPanel
          busy={busy}
          onAdd={(field) => actions.addField(item.id, field)}
        />
      )}

      <AttachmentsSection
        item={item}
        busy={busy}
        actions={actions}
        editMode={editingCredential}
      />

      {/* Destination — after the credential, because for an API key it is a
          footnote and only for a website login is it part of the identity. */}
      <DestinationSection
        item={item}
        busy={busy}
        actions={actions}
        caps={caps}
        editMode={editingCredential}
      />

      {/* Notes and other details — deliberately plaintext, loudly labelled */}
      <NotEncryptedSection
        item={item}
        busy={busy}
        actions={actions}
        canEdit={caps.can_edit === true}
        editMode={editingCredential}
      />

      {/* Action bar — the three everyday actions stay in reach; the rare and
          irreversible ones live one deliberate click away. */}
      <div className="flex flex-wrap items-center gap-1 border-t border-border pt-3">
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
              {caps.can_manage && (
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onSelect={() => setConfirmDelete(true)}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete credential
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

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

function readableBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentsSection({
  item,
  busy,
  actions,
  editMode,
}: {
  item: VaultItem;
  busy: boolean;
  actions: VaultActions;
  editMode: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [handling, setHandling] = useState<VaultHandling>("revealable");

  const add = async () => {
    if (!file || !label.trim()) return;
    await actions.addAttachment(item.id, file, {
      label: label.trim(),
      description: description.trim() || undefined,
      handling,
    });
    setFile(null);
    setLabel("");
    setDescription("");
    setHandling("revealable");
  };

  return (
    <section className="space-y-2" aria-labelledby={`vault-files-${item.id}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3
            id={`vault-files-${item.id}`}
            className="text-sm font-semibold text-foreground"
          >
            Protected files
          </h3>
          <p className="text-xs text-muted-foreground">
            Credential files are encrypted with this item and follow its access.
          </p>
        </div>
        <Badge variant="outline">{item.attachments.length}</Badge>
      </div>

      {item.attachments.length === 0 && !editMode && (
        <div className="rounded-lg border border-dashed border-border px-4 py-5 text-center">
          <FileKey2 className="mx-auto mb-2 h-5 w-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            No credential files are stored with this item.
          </p>
        </div>
      )}

      <div className="space-y-2">
        {item.attachments.map((attachment) => (
          <AttachmentRow
            key={attachment.id}
            item={item}
            attachment={attachment}
            busy={busy}
            actions={actions}
            editMode={editMode}
          />
        ))}
      </div>

      {editMode && item.capabilities.can_edit && (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-xs font-semibold">Add a protected file</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor={`attachment-file-${item.id}`}>File</Label>
              <Input
                id={`attachment-file-${item.id}`}
                type="file"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  setFile(next);
                  if (next && !label) setLabel(next.name);
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                Maximum 25 MB. The original bytes are encrypted.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`attachment-label-${item.id}`}>Label</Label>
              <Input
                id={`attachment-label-${item.id}`}
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Apple developer signing key"
              />
              <p className="text-[11px] text-muted-foreground">
                A human name that explains what the file is.
              </p>
            </div>
            <div className="space-y-1">
              <Label htmlFor={`attachment-purpose-${item.id}`}>Purpose</Label>
              <Input
                id={`attachment-purpose-${item.id}`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Used to sign App Store Connect API requests"
              />
            </div>
            <div className="space-y-1">
              <Label>Who can download it</Label>
              <Select
                value={handling}
                onValueChange={(value) => setHandling(value as VaultHandling)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="visible">
                    {HANDLING_LABELS.visible}
                  </SelectItem>
                  <SelectItem value="revealable">
                    {HANDLING_LABELS.revealable}
                  </SelectItem>
                  <SelectItem value="sealed">
                    {HANDLING_LABELS.sealed}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={busy || !file || !label.trim()}
              onClick={() => void add()}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Encrypt and add file
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function AttachmentRow({
  item,
  attachment,
  busy,
  actions,
  editMode,
}: {
  item: VaultItem;
  attachment: VaultAttachment;
  busy: boolean;
  actions: VaultActions;
  editMode: boolean;
}) {
  const [label, setLabel] = useState(attachment.label);
  const [description, setDescription] = useState(attachment.description ?? "");
  const [fileName, setFileName] = useState(attachment.file_name);
  const [handling, setHandling] = useState<VaultHandling>(
    attachment.handling as VaultHandling,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmSeal, setConfirmSeal] = useState(false);
  const canDownload =
    attachment.handling !== "sealed" &&
    (attachment.handling === "visible"
      ? item.capabilities.can_use
      : item.capabilities.can_reveal);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <dl className="grid min-w-0 flex-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[7rem_minmax(0,1fr)]">
          <dt className="font-medium text-muted-foreground">Label</dt>
          <dd className="break-words font-medium text-foreground">
            {attachment.label}
          </dd>
          <dt className="font-medium text-muted-foreground">File</dt>
          <dd className="break-all text-foreground">{attachment.file_name}</dd>
          <dt className="font-medium text-muted-foreground">Type and size</dt>
          <dd className="text-foreground">
            {attachment.media_type || "Unknown type"} ·{" "}
            {readableBytes(attachment.size_bytes)}
          </dd>
          <dt className="font-medium text-muted-foreground">Protection</dt>
          <dd className="text-foreground">
            {HANDLING_LABELS[attachment.handling as VaultHandling]}
          </dd>
          {attachment.description && (
            <>
              <dt className="font-medium text-muted-foreground">Purpose</dt>
              <dd className="whitespace-pre-wrap break-words text-foreground">
                {attachment.description}
              </dd>
            </>
          )}
        </dl>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || !canDownload}
          title={
            attachment.handling === "sealed"
              ? "Sealed files are available only to trusted automation"
              : undefined
          }
          onClick={() =>
            void actions.downloadAttachment(
              item.id,
              attachment.id,
              attachment.file_name,
            )
          }
        >
          {attachment.handling === "sealed" ? (
            <Lock className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Download className="mr-1.5 h-3.5 w-3.5" />
          )}
          {attachment.handling === "sealed" ? "Sealed" : "Download"}
        </Button>
      </div>

      {editMode && item.capabilities.can_edit && (
        <div className="mt-3 grid gap-2 border-t border-border pt-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Label</Label>
            <Input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Purpose</Label>
            <Input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Downloaded filename</Label>
            <Input
              value={fileName}
              onChange={(event) => setFileName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>Who can download it</Label>
            <Select
              value={handling}
              disabled={attachment.handling === "sealed"}
              onValueChange={(value) => setHandling(value as VaultHandling)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="visible">
                  {HANDLING_LABELS.visible}
                </SelectItem>
                <SelectItem value="revealable">
                  {HANDLING_LABELS.revealable}
                </SelectItem>
                <SelectItem value="sealed">{HANDLING_LABELS.sealed}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor={`replace-${attachment.id}`}>
              Replace file contents
            </Label>
            <Input
              id={`replace-${attachment.id}`}
              type="file"
              disabled={busy}
              onChange={(event) => {
                const next = event.target.files?.[0];
                if (next)
                  void actions.replaceAttachment(item.id, attachment.id, next);
              }}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
            <Button
              size="sm"
              variant="outline"
              disabled={
                busy ||
                !label.trim() ||
                !fileName.trim() ||
                (label === attachment.label &&
                  description === (attachment.description ?? "") &&
                  fileName === attachment.file_name &&
                  handling === attachment.handling)
              }
              onClick={() => {
                if (handling === "sealed" && attachment.handling !== "sealed") {
                  setConfirmSeal(true);
                  return;
                }
                void actions.updateAttachment(item.id, attachment.id, {
                  label: label.trim(),
                  description: description.trim() || undefined,
                  clear_description: !description.trim(),
                  file_name: fileName.trim(),
                  handling,
                });
              }}
            >
              Save file details
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete file
            </Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete protected file"
        description={
          <>
            Delete <b>{attachment.label}</b>? The encrypted file will be removed
            from this credential.
          </>
        }
        confirmLabel="Delete file"
        variant="destructive"
        busy={busy}
        onConfirm={async () => {
          await actions.deleteAttachment(item.id, attachment.id);
          setConfirmDelete(false);
        }}
      />
      <ConfirmDialog
        open={confirmSeal}
        onOpenChange={setConfirmSeal}
        title="Seal protected file"
        description={
          <>
            Seal <b>{attachment.label}</b>? No person will ever be able to
            download it again. Only trusted server automation can use its bytes,
            and this cannot be undone.
          </>
        }
        confirmLabel="Seal permanently"
        variant="destructive"
        busy={busy}
        onConfirm={async () => {
          await actions.updateAttachment(item.id, attachment.id, {
            label: label.trim(),
            description: description.trim() || undefined,
            clear_description: !description.trim(),
            file_name: fileName.trim(),
            handling: "sealed",
          });
          setConfirmSeal(false);
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
  editMode,
}: {
  item: VaultItem;
  field: VaultField;
  label: string | null;
  /** Part of the primary pair — the username/secret a person came here for. */
  emphasis: boolean;
  busy: boolean;
  actions: VaultActions;
  editMode: boolean;
}) {
  const caps = item.capabilities;
  const [valueDraft, setValueDraft] = useState("");
  const [envDraft, setEnvDraft] = useState(field.env_key ?? "");
  const [descDraft, setDescDraft] = useState(field.description ?? "");
  const [confirmSeal, setConfirmSeal] = useState(false);

  const displayLabel = fieldLabelOf(field, label);
  const showEnvAlias = !envAliasIsRedundant(field);
  const fieldTextChanged =
    Boolean(valueDraft) ||
    envDraft !== (field.env_key ?? "") ||
    descDraft !== (field.description ?? "");

  return (
    <div
      className={cn(
        "rounded-lg border transition-colors",
        emphasis
          ? "border-border bg-card px-3 py-2.5"
          : "border-border/70 bg-card/50 px-3 py-2",
      )}
    >
      <dl
        className={cn(
          "grid min-w-0 gap-x-4 gap-y-2 text-xs sm:grid-cols-[8rem_minmax(0,1fr)]",
          emphasis && "text-[13px]",
        )}
      >
        <dt className="font-medium text-muted-foreground">
          {VAULT_LABELS.fieldName}
        </dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-1.5 whitespace-normal break-words text-foreground">
          {displayLabel}
          {!field.editable && (
            <Badge variant="outline" className="font-normal">
              Managed
            </Badge>
          )}
          {!field.is_active && (
            <Badge variant="outline" className="font-normal">
              Inactive
            </Badge>
          )}
        </dd>
        {showEnvAlias && (
          <>
            <dt className="font-medium text-muted-foreground">
              {VAULT_LABELS.runtimeKey}
            </dt>
            <dd className="min-w-0 whitespace-normal break-all text-foreground">
              <code className="font-mono">{field.env_key}</code>
            </dd>
          </>
        )}
        <dt className="font-medium text-muted-foreground">
          {VAULT_LABELS.value}
        </dt>
        <dd className="min-w-0">
          {/* THE control — identical here, on the list card, and anywhere
              else a value is shown. Hidden until asked; sealed stays locked. */}
          <SecretValue
            item={item}
            field={field}
            showCountdown
            className="min-w-0"
          />
        </dd>
        <dt className="font-medium text-muted-foreground">
          {VAULT_LABELS.sandboxAccess}
        </dt>
        <dd className="text-foreground">
          {field.inject_into_sandbox ? "Enabled" : "Disabled"}
        </dd>
        {field.description && (
          <>
            <dt className="font-medium text-muted-foreground">
              {VAULT_LABELS.description}
            </dt>
            <dd className="whitespace-pre-wrap break-words text-foreground">
              {field.description}
            </dd>
          </>
        )}
      </dl>

      {editMode && caps.can_edit && (
        <div className="mt-3 space-y-3 rounded-md border border-border bg-muted/40 p-3">
          <p className="text-xs font-semibold">Edit {displayLabel}</p>
          {field.editable && (
            <div className="space-y-1">
              <Label htmlFor={`replacement-value-${field.id}`}>
                Replace stored value
              </Label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id={`replacement-value-${field.id}`}
                  type="password"
                  value={valueDraft}
                  onChange={(event) => setValueDraft(event.target.value)}
                  placeholder="Enter the complete new value"
                  className="min-w-48 flex-1 font-mono text-sm"
                  autoComplete="off"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                The current value is never placed into an editable input.
              </p>
            </div>
          )}
          {/* A sandbox env is a NAME->value map: with no env key the value has
              nowhere to land, so injection is impossible rather than merely
              unconfigured. The server refuses that state outright (422); the
              switch is disabled here so the user is pointed at the fix — set
              an env key below — instead of hitting an error. Flipping this on
              used to "succeed" and silently do nothing forever. */}
          <div className="min-w-0 space-y-1">
            <Label className="text-xs">{VAULT_LABELS.runtimeKey}</Label>
            <Input
              value={envDraft}
              onChange={(e) => setEnvDraft(e.target.value)}
              placeholder="DATA_FOR_SEO_EMAIL"
              className="h-8 font-mono text-xs"
              aria-invalid={Boolean(envDraft) && !VALID_KEY_RE.test(envDraft)}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Workflows find this value by its runtime key. Leave it empty only
            when the credential is stored for manual viewing and copying.
          </p>
          <div className="min-w-0 space-y-1">
            <Label className="text-xs">{VAULT_LABELS.description}</Label>
            <Input
              value={descDraft}
              onChange={(e) => setDescDraft(e.target.value)}
              placeholder="What is this field?"
              className="h-8 text-xs"
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={
                busy ||
                !fieldTextChanged ||
                (Boolean(envDraft) && !VALID_KEY_RE.test(envDraft))
              }
              onClick={async () => {
                if (valueDraft) {
                  await actions.updateFieldValue(item.id, field.id, valueDraft);
                  setValueDraft("");
                }
                if (
                  envDraft !== (field.env_key ?? "") ||
                  descDraft !== (field.description ?? "")
                ) {
                  await actions.updateFieldMeta(item.id, field.id, {
                    ...(envDraft
                      ? { env_key: envDraft }
                      : { clear_env_key: true }),
                    description: descDraft || null,
                  });
                }
              }}
            >
              Save field changes
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-center justify-between gap-2 rounded border border-border bg-background p-2 text-xs">
              <span>{VAULT_LABELS.fieldStatus}</span>
              <Switch
                checked={field.is_active}
                disabled={busy}
                onCheckedChange={(checked) =>
                  void actions.updateFieldMeta(item.id, field.id, {
                    is_active: checked,
                  })
                }
                aria-label={VAULT_LABELS.fieldStatus}
              />
            </label>
            <label
              className="flex items-center justify-between gap-2 rounded border border-border bg-background p-2 text-xs"
              title={
                field.env_key
                  ? undefined
                  : "Set a runtime key first — a sandbox variable needs a name."
              }
            >
              <span>
                {VAULT_LABELS.sandboxAccess}
                {field.env_key ? "" : " — runtime key required"}
              </span>
              <Switch
                checked={field.inject_into_sandbox}
                disabled={busy || !field.env_key}
                onCheckedChange={(checked) =>
                  void actions.setInject(item.id, field.id, checked)
                }
                aria-label={VAULT_LABELS.sandboxAccess}
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {field.handling === "sealed" ? (
              <span className="flex items-center gap-1 whitespace-normal text-xs text-muted-foreground">
                <Lock className="h-3 w-3" />
                {HANDLING_LABELS.sealed}
              </span>
            ) : (
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <Label className="text-xs text-muted-foreground">
                  {VAULT_LABELS.valueAccess}
                </Label>
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
                  <SelectTrigger
                    className="h-auto min-h-8 min-w-56 flex-1 whitespace-normal text-left text-xs"
                    aria-label={VAULT_LABELS.valueAccess}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visible">
                      {HANDLING_LABELS.visible}
                    </SelectItem>
                    <SelectItem value="revealable">
                      {HANDLING_LABELS.revealable}
                    </SelectItem>
                    <SelectItem value="sealed">
                      {HANDLING_LABELS.sealed}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <div className="flex justify-end border-t border-border pt-3">
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => void actions.deleteField(item.id, field.id)}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete field
            </Button>
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
            Sealing <b>{field.env_key ?? field.field_key}</b> cannot be undone —
            sealed values can never be shown to a human again. Trusted server
            execution can still use them.
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
  const [fieldName, setFieldName] = useState("");
  const [value, setValue] = useState("");
  const [envKey, setEnvKey] = useState("");
  const [handling, setHandling] = useState<VaultHandling>("revealable");
  const [inject, setInject] = useState(false);
  const fieldKey = sanitizeFieldName(fieldName);

  const valid =
    FIELD_KEY_RE.test(fieldKey) &&
    value.length > 0 &&
    (!envKey || VALID_KEY_RE.test(envKey));

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">{VAULT_LABELS.fieldName}</Label>
          <Input
            value={fieldName}
            onChange={(e) => setFieldName(e.target.value)}
            placeholder="API login"
            className="h-8 text-xs"
            aria-invalid={Boolean(fieldName) && !FIELD_KEY_RE.test(fieldKey)}
          />
          {fieldName && (
            <p className="whitespace-normal break-all text-[11px] text-muted-foreground">
              {VAULT_LABELS.internalFieldId}:{" "}
              <code className="font-mono">{fieldKey || "invalid"}</code>
            </p>
          )}
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{VAULT_LABELS.runtimeKey}</Label>
          <Input
            value={envKey}
            onChange={(e) => setEnvKey(e.target.value)}
            placeholder="DATA_FOR_SEO_EMAIL"
            className="h-8 font-mono text-xs"
            aria-invalid={Boolean(envKey) && !VALID_KEY_RE.test(envKey)}
          />
          <p className="text-[11px] text-muted-foreground">
            Required when a workflow finds this value by name.
          </p>
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{VAULT_LABELS.value}</Label>
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
          <Select
            value={handling}
            onValueChange={(v) => setHandling(v as VaultHandling)}
          >
            <SelectTrigger
              className="h-auto min-h-8 min-w-56 whitespace-normal text-left text-xs"
              aria-label={VAULT_LABELS.valueAccess}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="visible">{HANDLING_LABELS.visible}</SelectItem>
              <SelectItem value="revealable">
                {HANDLING_LABELS.revealable}
              </SelectItem>
              <SelectItem value="sealed">{HANDLING_LABELS.sealed}</SelectItem>
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
            {VAULT_LABELS.sandboxAccess}
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
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Plus className="mr-2 h-4 w-4" />
          )}
          Add field
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
  editMode,
}: {
  item: VaultItem;
  busy: boolean;
  actions: VaultActions;
  caps: VaultItem["capabilities"];
  editMode: boolean;
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
      toast.success(
        "Login URL added — this item can now be matched in the browser",
      );
    } finally {
      setPromoting(null);
    }
  };

  const hasDestination = item.login_urls.length > 0;
  const supportsDestination =
    item.definition_key === WEBSITE_LOGIN_DEFINITION_KEY ||
    hasDestination ||
    promotable.length > 0;
  // Website destinations do not belong on API keys or environment values.
  // The definition decides whether this section exists; users no longer have
  // to interpret a generic credential editor that mixes both concepts.
  if (!supportsDestination) return null;

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Globe className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold">Website destination</p>
      </div>

      {hasDestination ? (
        <ul className="space-y-1">
          {item.login_urls.map((url) => (
            <li
              key={url}
              className="flex items-center gap-2 rounded border border-border bg-background px-2 py-1 text-xs"
            >
              <span className="min-w-0 flex-1 whitespace-normal break-all font-mono">
                {url}
              </span>
              {editMode && caps.can_edit && (
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

      {!editMode && hasDestination && (
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-medium text-muted-foreground">
              {VAULT_LABELS.browserMatchRule}
            </dt>
            <dd className="mt-0.5 text-foreground">
              {URI_MATCH_MODE_LABELS[item.uri_match_mode as UriMatchMode]}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-muted-foreground">
              {VAULT_LABELS.browserFill}
            </dt>
            <dd className="mt-0.5 text-foreground">
              {item.browser_fill_enabled ? "Enabled" : "Disabled"}
            </dd>
          </div>
        </dl>
      )}

      {editMode && caps.can_edit && (
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
              <Label className="text-xs">{VAULT_LABELS.browserMatchRule}</Label>
              <Select
                value={item.uri_match_mode}
                onValueChange={(v) =>
                  void actions.updateItem(item.id, {
                    uri_match_mode: v as UriMatchMode,
                  })
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
            <label className="flex items-end gap-2 rounded border border-border bg-background p-2">
              <Switch
                checked={item.browser_fill_enabled}
                disabled={busy || !hasDestination}
                onCheckedChange={(checked) =>
                  void actions.updateItem(item.id, {
                    browser_fill_enabled: checked,
                  })
                }
              />
              <span className="text-xs">{VAULT_LABELS.browserFill}</span>
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
  editMode,
}: {
  item: VaultItem;
  busy: boolean;
  actions: VaultActions;
  canEdit: boolean;
  editMode: boolean;
}) {
  const [draft, setDraft] = useState(item.notes ?? "");
  const [detailDrafts, setDetailDrafts] = useState(
    item.non_secret_fields.map((entry) => ({ ...entry })),
  );

  const hasContent = Boolean(item.notes) || item.non_secret_fields.length > 0;
  if (!hasContent && (!canEdit || !editMode)) return null;

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
              className="grid gap-1 rounded border border-border bg-background px-2 py-1 text-xs sm:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)]"
            >
              <dt className="font-medium text-muted-foreground">
                {entry.label}
              </dt>
              <dd className="min-w-0 whitespace-pre-wrap break-all">
                {entry.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {editMode && canEdit ? (
        <div className="space-y-3 border-t border-warning/30 pt-3">
          <div className="space-y-1.5">
            <Label htmlFor={`vault-notes-${item.id}`}>
              {VAULT_LABELS.notes}
            </Label>
            <textarea
              id={`vault-notes-${item.id}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={4}
              className="w-full rounded border border-border bg-background p-2 text-xs"
              placeholder="Anything that is not a secret — account numbers, support contacts, reminders."
            />
          </div>
          <div className="space-y-2">
            <Label>{VAULT_LABELS.otherDetails}</Label>
            {detailDrafts.map((entry, index) => (
              <div
                key={`${entry.key}-${index}`}
                className="grid gap-2 rounded border border-border bg-background p-2 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]"
              >
                <Input
                  aria-label={`${VAULT_LABELS.fieldName} ${index + 1}`}
                  value={entry.label}
                  onChange={(event) =>
                    setDetailDrafts((current) =>
                      current.map((value, currentIndex) =>
                        currentIndex === index
                          ? {
                              ...value,
                              label: event.target.value,
                              key:
                                sanitizeFieldName(event.target.value) ||
                                value.key,
                            }
                          : value,
                      ),
                    )
                  }
                  placeholder={VAULT_LABELS.fieldName}
                />
                <Input
                  aria-label={`${VAULT_LABELS.value} ${index + 1}`}
                  value={entry.value}
                  onChange={(event) =>
                    setDetailDrafts((current) =>
                      current.map((value, currentIndex) =>
                        currentIndex === index
                          ? { ...value, value: event.target.value }
                          : value,
                      ),
                    )
                  }
                  placeholder={VAULT_LABELS.value}
                />
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() =>
                    setDetailDrafts((current) =>
                      current.filter(
                        (_, currentIndex) => currentIndex !== index,
                      ),
                    )
                  }
                >
                  <X className="mr-1.5 h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setDetailDrafts((current) => [
                  ...current,
                  {
                    key: `detail_${current.length + 1}`,
                    label: "",
                    value: "",
                  },
                ])
              }
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add other detail
            </Button>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                const next = draft.trim();
                await actions.updateItem(item.id, {
                  non_secret_fields: detailDrafts
                    .map((entry) => ({
                      key: sanitizeFieldName(entry.label) || entry.key,
                      label: entry.label.trim(),
                      value: entry.value,
                    }))
                    .filter((entry) => entry.label && entry.value),
                  ...(next ? { notes: next } : { clear_notes: true }),
                });
              }}
            >
              Save notes and other details
            </Button>
          </div>
        </div>
      ) : (
        item.notes && (
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              {VAULT_LABELS.notes}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words rounded border border-border bg-background p-2 text-xs">
              {item.notes}
            </p>
          </div>
        )
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
              <SelectItem value="all_members">
                All organization members
              </SelectItem>
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
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  "Share"
                )}
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
                {/* Honest claim only: this panel knows the grant list, not
                    every access path (org admins, org-wide mode), so it
                    reports the list — never "Only you" (D106b). */}
                {isOrg
                  ? "No individual members granted yet. Add someone above. Organization admins always retain access."
                  : "No one has been granted access yet. Add someone above to share this credential."}
              </p>
            ) : (
              grants.map((grant) => (
                <div
                  key={grant.id}
                  className="flex items-center gap-2 rounded border border-border bg-background p-2 text-xs"
                >
                  <span className="min-w-0 flex-1 whitespace-normal break-all">
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
          <SelectTrigger
            className="h-8 min-w-48 flex-1 text-xs"
            aria-label="Destination"
          >
            <SelectValue
              placeholder={loading ? "Loading…" : "Choose a destination"}
            />
          </SelectTrigger>
          <SelectContent>
            {allowPersonal && (
              <SelectItem value="__personal__">My personal vault</SelectItem>
            )}
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
              <span className="font-medium capitalize">
                {entry.action.replaceAll("_", " ")}
              </span>
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
