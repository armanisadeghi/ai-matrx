"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Loader2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Credenza,
  CredenzaBody,
  CredenzaContent,
  CredenzaHeader,
  CredenzaTitle,
} from "@/components/ui/credenza-modal/credenza";
import { createClient } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { fetchCsvImportLimits } from "../csv-import-limits";
import { fetchBitwardenJsonImportLimits } from "../csv-import-limits";
import { prepareBitwardenCommand, type BitwardenImportRecord } from "../bitwarden-json";
import {
  hasAmbiguousCsvMapping,
  isPossibleDuplicateRow,
  parseCsvFile,
  prepareCsvImportRow,
  runCsvImportCommands,
  suggestedCsvMapping,
  toCsvImportCommand,
  safeDestination,
  type CsvColumnRole,
  type CsvImportOutcome,
  type CsvImportPreview,
} from "../csv-import";
import {
  createVaultItem,
  getVaultImportActor,
  VaultImportTransportError,
  type VaultExpectedActor,
} from "../vault-service";
import type { VaultPrincipal } from "../types";

const SOURCES = [
  ["generic", "CSV export"],
  ["chrome", "Chrome / Google Password Manager"],
  ["bitwarden", "Bitwarden"],
  ["1password", "1Password"],
  ["lastpass", "LastPass"],
  ["apple", "Apple Passwords / Safari"],
  ["edge", "Microsoft Edge"],
  ["firefox", "Firefox"],
  ["dashlane", "Dashlane"],
  ["nordpass", "NordPass"],
  ["keeper", "Keeper"],
  ["proton", "Proton Pass CSV"],
  ["roboform", "RoboForm"],
  ["keepass", "KeePass / KeePassXC CSV"],
] as const;
const SOURCE_URLS: Record<string, string> = {
  chrome: "https://support.google.com/chrome/answer/13068232",
  bitwarden: "https://bitwarden.com/help/export-your-data/",
  "1password": "https://support.1password.com/export/",
  lastpass:
    "https://support.lastpass.com/s/document-item?language=en_US&bundleId=lastpass&topicId=LastPass/export-your-vault-data.html",
  apple: "https://support.apple.com/en-au/guide/passwords/mchl35b12625/mac",
  edge: "https://support.microsoft.com/en-us/edge/export-passwords-in-microsoft-edge",
  firefox: "https://support.mozilla.org/en-US/kb/export-login-data-firefox",
  dashlane:
    "https://support.dashlane.com/hc/en-us/articles/32905278138002-Export-your-Dashlane-data-to-a-CSV",
  nordpass:
    "https://support.nordpass.com/hc/en-us/articles/360007646477-How-to-export-passwords-from-NordPass",
  keeper: "https://docs.keeper.io/user-guides/web-vault",
  roboform:
    "https://help.roboform.com/hc/en-us/articles/230425008-How-to-export-your-RoboForm-logins-into-a-CSV-file",
  proton: "https://proton.me/support/pass-export",
  keepass: "https://keepassxc.org/docs/KeePassXC_UserGuide",
};
const ROLES: CsvColumnRole[] = [
  "keep",
  "title",
  "username",
  "password",
  "url",
  "notes",
  "otp",
];

export function VaultCsvImportDialog({
  open,
  onOpenChange,
  principal,
  existingItems,
  onCommitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  principal: VaultPrincipal;
  existingItems: { displayName: string; loginUrls: string[] }[];
  onCommitted: () => Promise<void>;
}) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const cancelled = useRef(false);
  const limitsRef = useRef<Awaited<
    ReturnType<typeof fetchCsvImportLimits>
  > | null>(null);
  const frozenCommands = useRef<ReturnType<typeof toCsvImportCommand>[]>([]);
  const previewActor = useRef<VaultExpectedActor | null>(null);
  const progressCursor = useRef(0);
  const clearAfterRun = useRef(false);
  const invalidated = useRef(false);
  const [source, setSource] = useState("generic");
  const [jsonRecords, setJsonRecords] = useState<BitwardenImportRecord[]>([]);
  const [includeTrash, setIncludeTrash] = useState(false);
  const [metadataApproved, setMetadataApproved] = useState(false);
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [mapping, setMapping] = useState<CsvColumnRole[]>([]);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [enableBrowserFill, setEnableBrowserFill] = useState(false);
  const [createDuplicateRows, setCreateDuplicateRows] = useState<Set<number>>(
    new Set(),
  );
  const [skipInvalidRows, setSkipInvalidRows] = useState<Set<number>>(
    new Set(),
  );
  const [result, setResult] = useState<CsvImportOutcome | null>(null);
  const [otpItems, setOtpItems] = useState<{ id: string; title: string }[]>([]);

  const clearSensitiveDraft = (preserveResult = false) => {
    cancelled.current = true;
    limitsRef.current = null;
    frozenCommands.current = [];
    previewActor.current = null;
    progressCursor.current = 0;
    setPreview(null);
    setJsonRecords([]);
    setIncludeTrash(false);
    setMetadataApproved(false);
    setMapping([]);
    setUnavailable(null);
    setEnableBrowserFill(false);
    setCreateDuplicateRows(new Set());
    setSkipInvalidRows(new Set());
    if (!preserveResult) {
      setResult(null);
      setOtpItems([]);
    }
  };
  const invalidateDraft = (message: string) => {
    invalidated.current = true;
    clearSensitiveDraft();
    setError(message);
  };

  useEffect(
    () => () => {
      cancelled.current = true;
      limitsRef.current = null;
      frozenCommands.current = [];
      previewActor.current = null;
      progressCursor.current = 0;
    },
    [],
  );
  useEffect(() => {
    const {
      data: { subscription },
    } = createClient().auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT" || event === "USER_UPDATED")
        invalidateDraft(
          "Your account changed. Choose the file and review the import again.",
        );
    });
    return () => subscription.unsubscribe();
  }, []);
  const principalKey =
    principal.type === "organization"
      ? `organization:${principal.organizationId}`
      : "user";
  const previousPrincipalKey = useRef(principalKey);
  useEffect(() => {
    if (previousPrincipalKey.current === principalKey) return;
    previousPrincipalKey.current = principalKey;
    invalidateDraft(
      "The import destination changed. Choose the file and review the import again.",
    );
  }, [principalKey]);
  const selectedOrganizationId = useAppSelector(selectOrganizationId);
  const previousOrganizationId = useRef(selectedOrganizationId);
  useEffect(() => {
    if (previousOrganizationId.current === selectedOrganizationId) return;
    previousOrganizationId.current = selectedOrganizationId;
    invalidateDraft(
      "The request organization changed. Choose the file and review the import again.",
    );
  }, [selectedOrganizationId]);
  const close = (next: boolean) => {
    if (!next) {
      cancelled.current = true;
      setError(null);
      if (running) clearAfterRun.current = true;
      else clearSensitiveDraft();
    }
    onOpenChange(next);
  };
  const load = async (file: File) => {
    clearSensitiveDraft();
    cancelled.current = false;
    invalidated.current = false;
    clearAfterRun.current = false;
    setError(null);
    setUnavailable(null);
    setResult(null);
    try {
      const actor = await getVaultImportActor();
      const limits = await (source === "bitwarden_json" ? fetchBitwardenJsonImportLimits : fetchCsvImportLimits)(
        actor.organizationId,
        actor.userId,
      );
      if (cancelled.current) return;
      previewActor.current = actor;
      limitsRef.current = limits;
      if (source === "bitwarden_json") {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
        const { createBitwardenJsonWorker } = await import("../bitwarden-json-worker-client");
        const parser = createBitwardenJsonWorker();
        const timeout = window.setTimeout(() => { parser.terminate(); if (!cancelled.current) setUnavailable("The JSON export took too long to parse. Choose a smaller export and try again."); }, limits.jsonParseTimeoutMs ?? 5_000);
        parser.onmessage = (event: MessageEvent<{ ok: boolean; records?: BitwardenImportRecord[]; error?: string }>) => { window.clearTimeout(timeout); parser.terminate(); if (cancelled.current) return; if (!event.data.ok) { setUnavailable(event.data.error ?? "The JSON export could not be read."); return; } setJsonRecords(event.data.records ?? []); };
        parser.postMessage({ text, limits: { maxFileBytes: limits.maxFileBytes, maxRecords: limits.maxRecords, maxCellBytes: limits.maxCellBytes, maxJsonDepth: limits.maxJsonDepth ?? 64 } });
        return;
      }
      const parsed = await parseCsvFile(file, limits);
      if (cancelled.current) return;
      setPreview(parsed);
      setMapping(suggestedCsvMapping(parsed.headers));
    } catch (cause) {
      if (!cancelled.current)
        setUnavailable(
          cause instanceof Error
            ? cause.message
            : "Vault import is unavailable.",
        );
    }
  };
  const preparedRows = useMemo(() => {
    if (!preview || !limitsRef.current || !previewActor.current) return [];
    return preview.rows.map((row) =>
      prepareCsvImportRow({
        source,
        preview,
        row,
        mapping,
        principal,
        expectedActor: previewActor.current!,
        rowId: `preview-${row.rowNumber}`,
        limits: limitsRef.current!,
        browserFillEnabled: enableBrowserFill,
        existingItems,
        skipPossibleDuplicate: !createDuplicateRows.has(row.rowNumber),
      }),
    );
  }, [
    createDuplicateRows,
    enableBrowserFill,
    existingItems,
    mapping,
    preview,
    principal,
    source,
  ]);
  const selectedInvalidRows = preparedRows.filter(
    (prepared, index) =>
      prepared.status === "invalid" &&
      !skipInvalidRows.has(preview?.rows[index]?.rowNumber ?? -1),
  );
  const firstInvalidDiagnostic = selectedInvalidRows.find(
    (prepared): prepared is Extract<typeof prepared, { status: "invalid" }> =>
      prepared.status === "invalid",
  )?.diagnostic;
  const importRows = async (retry = false) => {
    const limits = limitsRef.current;
    if ((!preview && !jsonRecords.length) || !limits) return;
    if (source === "bitwarden_json" && !metadataApproved) {
      setError("Confirm the visible destination and public-key metadata before importing.");
      return;
    }
    if (hasAmbiguousCsvMapping(mapping)) {
      setError(
        "Map each title, username, password, notes, and OTP column once before importing.",
      );
      return;
    }
    if (!retry && selectedInvalidRows.length > 0) {
      setError(firstInvalidDiagnostic ?? "Review invalid rows.");
      return;
    }
    setRunning(true);
    setError(null);
    cancelled.current = false;
    invalidated.current = false;
    try {
      const actor = await getVaultImportActor();
      if (
        !previewActor.current ||
        previewActor.current.userId !== actor.userId ||
        previewActor.current.organizationId !== actor.organizationId
      ) {
        invalidateDraft(
          "Your account or request organization changed. Choose the file and review the import again.",
        );
        return;
      }
      const commands = retry
        ? frozenCommands.current
        : source === "bitwarden_json"
          ? jsonRecords.map((record) => {
              const prepared = prepareBitwardenCommand({ record, principal, expectedActor: actor, rowId: crypto.randomUUID(), browserFillEnabled: enableBrowserFill, includeTrash, limits });
              return prepared.command ?? null;
            })
          : preview!.rows.map((row) => {
            const prepared = prepareCsvImportRow({
              source,
              preview: preview!,
              row,
              mapping,
              principal,
              expectedActor: actor,
              rowId: crypto.randomUUID(),
              limits,
              browserFillEnabled: enableBrowserFill,
              existingItems,
              skipPossibleDuplicate: !createDuplicateRows.has(row.rowNumber),
            });
            if (prepared.status === "invalid") return null;
            return prepared.status === "ready" ? prepared.command : null;
          });
      if (!retry) {
        frozenCommands.current = commands;
        progressCursor.current = 0;
        setResult(null);
        setOtpItems([]);
      }
      const outcome = await runCsvImportCommands(
        commands,
        async (command) => {
          try {
            const created = await createVaultItem(command.body, {
              idempotencyKey: command.rowId,
              expectedActor: command.expectedActor,
            });
            if (command.hasOtp)
              setOtpItems((current) =>
                current.some((item) => item.id === created.id)
                  ? current
                  : [
                      ...current,
                      { id: created.id, title: created.display_name },
                    ],
              );
            return "committed" as const;
          } catch (cause) {
            if (
              cause instanceof VaultImportTransportError &&
              cause.code === "context_changed"
            ) {
              invalidateDraft(cause.message);
              return "definitive" as const;
            }
            if (
              cause instanceof VaultImportTransportError &&
              cause.code === "retryable"
            ) {
              setError(cause.message);
              return "retryable" as const;
            }
            setError(
              "This row was rejected. Review the import before creating a new session.",
            );
            return "definitive" as const;
          }
        },
        () => cancelled.current,
        progressCursor.current,
      );
      await onCommitted();
      if (!invalidated.current) {
        progressCursor.current = outcome.progressCursor;
        setResult((previous) => ({
          imported: (retry ? (previous?.imported ?? 0) : 0) + outcome.imported,
          skipped: (retry ? (previous?.skipped ?? 0) : 0) + outcome.skipped,
          failed: outcome.failed,
          cancelled: outcome.cancelled,
          definitive: outcome.definitive,
          progressCursor: outcome.progressCursor,
        }));
        if (outcome.definitive) {
          clearSensitiveDraft(true);
        } else if (outcome.progressCursor === commands.length) {
          clearSensitiveDraft(true);
        }
      }
    } catch (cause) {
      invalidateDraft(
        cause instanceof Error
          ? "Your account or request organization is no longer available. Choose the file and review the import again."
          : "The import could not continue. Choose the file and review it again.",
      );
    } finally {
      setRunning(false);
      if (clearAfterRun.current) {
        clearAfterRun.current = false;
        clearSensitiveDraft(true);
      }
    }
  };
  const invalidRows =
    preview?.rows.filter((row) => row.issue === "invalid").length ?? 0;
  const unsupportedRows =
    preview?.rows.filter((row) => row.issue === "unsupported").length ?? 0;
  return (
    <Credenza open={open} onOpenChange={close}>
      <CredenzaContent className="md:max-w-3xl">
        <CredenzaHeader>
      <CredenzaTitle>Import passwords</CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="space-y-4 pb-6">
          <p className="text-sm text-muted-foreground">
            This import stays in this browser until you confirm each encrypted
            credential. Passwords and notes are never shown in the preview.
          </p>
          {!preview && !jsonRecords.length && (
            <div className="space-y-3">
              <Label>Export source</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map(([value, label]) => (
                <SelectItem key={value} value={value}>
                      {label}
                </SelectItem>
              ))}
                    <SelectItem value="bitwarden_json">Bitwarden JSON</SelectItem>
                </SelectContent>
              </Select>
              {SOURCE_URLS[source] && (
                <a
                  className="text-xs text-primary underline"
                  href={SOURCE_URLS[source]}
                  target="_blank"
                  rel="noreferrer"
                >
                  How to export from this password manager
                </a>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInput.current?.click()}
              >
                <FileUp className="mr-2 h-4 w-4" />
                Choose import file
              </Button>
              <input
                ref={fileInput}
                className="hidden"
                type="file"
                accept={source === "bitwarden_json" ? "application/json,.json" : ".csv,text/csv"}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void load(file);
                  event.target.value = "";
                }}
              />
            </div>
          )}
          {unavailable && (
            <div className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">
              {unavailable} Ask an organization administrator to enable Vault
              import settings, then try again.
            </div>
          )}
          {preview && (
            <div className="space-y-3">
              <p className="text-sm">
                {preview.rows.length} records ready for review.{" "}
                {invalidRows
                  ? `${invalidRows} invalid rows will be skipped. `
                  : ""}
                {unsupportedRows
                  ? `${unsupportedRows} non-login, passkey, or attachment rows are unsupported by CSV and will be skipped.`
                  : ""}
              </p>
              {preparedRows.map((prepared, index) => {
                if (prepared.status !== "invalid") return null;
                const row = preview.rows[index];
                if (!row) return null;
                const skipped = skipInvalidRows.has(row.rowNumber);
                return (
                  <div
                    key={`invalid-${row.rowNumber}`}
                    className="flex items-center justify-between gap-2 rounded-md border border-destructive/40 p-2 text-xs text-destructive"
                  >
                    <span>
                      {skipped
                        ? `Row ${row.rowNumber} will be skipped.`
                        : prepared.diagnostic}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setSkipInvalidRows((current) => {
                          const next = new Set(current);
                          if (skipped) next.delete(row.rowNumber);
                          else next.add(row.rowNumber);
                          return next;
                        })
                      }
                    >
                      {skipped ? "Review row" : "Skip row"}
                    </Button>
                  </div>
                );
              })}
              <div className="grid gap-2 sm:grid-cols-2">
                {preview.headers.map((header, index) => (
                  <div
                    key={`${header}-${index}`}
                    className="flex items-center gap-2"
                  >
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {header || `Column ${index + 1}`}
                    </span>
                    <Select
                      value={mapping[index]}
                      onValueChange={(value) =>
                        setMapping((current) =>
                          current.map((role, i) =>
                            i === index ? (value as CsvColumnRole) : role,
                          ),
                        )
                      }
                    >
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((role) => (
                          <SelectItem key={role} value={role}>
                            {role === "keep" ? "Preserve encrypted" : role}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <div className="max-h-80 space-y-2 overflow-y-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Masked preview:
                {preview.rows.map((row) => {
                  const duplicate = isPossibleDuplicateRow(
                    row,
                    preview,
                    mapping,
                    existingItems,
                  );
                  return (
                    <div
                      key={row.rowNumber}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>{maskedRowSummary(row, preview, mapping)}</span>
                      {duplicate && (
                        <label className="flex shrink-0 items-center gap-1">
                          <Switch
                            checked={createDuplicateRows.has(row.rowNumber)}
                            onCheckedChange={(checked) =>
                              setCreateDuplicateRows((current) => {
                                const next = new Set(current);
                                if (checked) next.add(row.rowNumber);
                                else next.delete(row.rowNumber);
                                return next;
                              })
                            }
                            aria-label={`Create possible duplicate at row ${row.rowNumber}`}
                          />
                          <span>
                            {createDuplicateRows.has(row.rowNumber)
                              ? "Create separately"
                              : "Skip"}
                          </span>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Possible duplicates use matching title and URL metadata. They
                are skipped by default; existing credentials are never
                overwritten. OTP data is preserved inactive and requires
                explicit Authenticator setup after import.
              </p>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={enableBrowserFill}
                  onCheckedChange={setEnableBrowserFill}
                  aria-label="Enable browser fill for eligible imported logins"
                />
                <span>
                  Enable browser fill only for imported logins that have a
                  username, password, and HTTPS or loopback destination.
                  Matching destinations become visible credential metadata.
                </span>
              </label>
            </div>
          )}
          {jsonRecords.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm">{jsonRecords.filter((record) => record.status === "supported").length} supported; {jsonRecords.filter((record) => record.status === "skipped").length} deleted; {jsonRecords.filter((record) => record.status === "invalid").length} invalid; {jsonRecords.filter((record) => record.status === "unsupported").length} unsupported. Unsupported records stay local and are never sent.</p>
              <div className="max-h-80 space-y-1 overflow-y-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">{jsonRecords.map((record) => <div key={record.ordinal}>#{record.ordinal + 1}: {record.title} · {record.kind.replace("_", " ")} · {record.status}{record.reason ? ` — ${record.reason}` : ""}</div>)}</div>
              <label className="flex items-start gap-2 text-xs text-muted-foreground"><Switch checked={includeTrash} onCheckedChange={setIncludeTrash}/><span>Include deleted source items. They are skipped by default.</span></label>
              <label className="flex items-start gap-2 text-xs text-muted-foreground"><Switch checked={enableBrowserFill} onCheckedChange={setEnableBrowserFill}/><span>Enable browser fill only for eligible logins with a username, password, and HTTPS or loopback destination. Matching destinations become visible credential metadata.</span></label>
              {jsonRecords.some((record) => record.hasVisiblePublicKey) && <p className="text-xs text-muted-foreground">SSH public keys are visible metadata. Private keys and source records are revealable only, and none are injected into a sandbox.</p>}
              <label className="flex items-start gap-2 text-xs text-muted-foreground"><Switch checked={metadataApproved} onCheckedChange={setMetadataApproved}/><span>I approve disclosure of the listed destination and public-key metadata.</span></label>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && (
            <div className="space-y-2 text-sm">
              <p>
                Imported {result.imported}; skipped {result.skipped}; failed{" "}
                {result.failed}.
                {result.cancelled
                  ? " Stopped after the confirmed current row."
                  : ""}
              </p>
              {otpItems.length > 0 && (
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>Finish authenticator setup for imported OTP records:</p>
                  {otpItems.map((item) => (
                    <a
                      key={item.id}
                      className="block text-primary underline"
                      href={`/vault/${encodeURIComponent(item.id)}`}
                    >
                      Set up authenticator for {item.title}
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2">
            {running && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  cancelled.current = true;
                  clearAfterRun.current = true;
                }}
              >
                <X className="mr-2 h-4 w-4" />
                Stop after current row
              </Button>
            )}
            {(preview || jsonRecords.length > 0) && (!result || result.failed > 0) && (
              <Button
                type="button"
                disabled={running}
                onClick={() => void importRows(Boolean(result?.failed))}
              >
                {running ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-4 w-4" />
                )}
                {result?.failed
                  ? "Retry current row"
                  : "Import selected records"}
              </Button>
            )}
          </div>
        </CredenzaBody>
      </CredenzaContent>
    </Credenza>
  );
}

function maskedRowSummary(
  row: CsvImportPreview["rows"][number],
  preview: CsvImportPreview,
  mapping: CsvColumnRole[],
): string {
  if (row.issue === "invalid") return `Row ${row.rowNumber}: invalid — skipped`;
  if (row.issue === "unsupported")
    return `Row ${row.rowNumber}: unsupported item type — skipped`;
  const value = (role: CsvColumnRole) =>
    row.cells[mapping.findIndex((entry) => entry === role)] ?? "";
  const hosts = row.cells
    .filter((_, index) => mapping[index] === "url")
    .map(safeDestination)
    .flatMap((destination) => (destination.host ? [destination.host] : []));
  const title = value("title") || `Imported credential ${row.rowNumber}`;
  const presence =
    [
      value("username") && "username",
      value("password") && "password",
      value("otp") && "OTP",
    ]
      .filter(Boolean)
      .join(", ") || "no mapped credential fields";
  return `Row ${row.rowNumber}: ${title} · Website login · ${hosts.join(", ") || "no destination"} · ${presence}`;
}
