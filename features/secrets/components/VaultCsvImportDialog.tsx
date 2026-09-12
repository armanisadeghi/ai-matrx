"use client";

import { useEffect, useRef, useState } from "react";
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
import { fetchCsvImportLimits } from "../csv-import-limits";
import {
  hasAmbiguousCsvMapping,
  parseCsvFile,
  runCsvImportCommands,
  suggestedCsvMapping,
  toCsvImportCommand,
  safeDestination,
  type CsvColumnRole,
  type CsvImportPreview,
} from "../csv-import";
import {
  createVaultItem,
  getVaultImportActor,
  VaultImportTransportError,
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
  dashlane:
    "https://support.dashlane.com/hc/en-us/articles/32905278138002-Export-your-Dashlane-data-to-a-CSV",
  nordpass:
    "https://support.nordpass.com/hc/en-us/articles/360007646477-How-to-export-passwords-from-NordPass",
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
  const [source, setSource] = useState("generic");
  const [preview, setPreview] = useState<CsvImportPreview | null>(null);
  const [mapping, setMapping] = useState<CsvColumnRole[]>([]);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [enableBrowserFill, setEnableBrowserFill] = useState(false);
  const [createPossibleDuplicates, setCreatePossibleDuplicates] =
    useState(false);
  const [result, setResult] = useState<{
    imported: number;
    skipped: number;
    failed: number;
  } | null>(null);

  useEffect(
    () => () => {
      cancelled.current = true;
      limitsRef.current = null;
      frozenCommands.current = [];
    },
    [],
  );
  const close = (next: boolean) => {
    if (!next && !running) {
      cancelled.current = true;
      setPreview(null);
      setMapping([]);
      setError(null);
      setResult(null);
      limitsRef.current = null;
      frozenCommands.current = [];
    }
    onOpenChange(next);
  };
  const load = async (file: File) => {
    cancelled.current = false;
    setError(null);
    setUnavailable(null);
    setResult(null);
    try {
      const actor = await getVaultImportActor();
      const limits = await fetchCsvImportLimits(
        actor.organizationId,
        actor.userId,
      );
      if (cancelled.current) return;
      limitsRef.current = limits;
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
  const importRows = async (retry = false) => {
    const limits = limitsRef.current;
    if (!preview || !limits) return;
    if (hasAmbiguousCsvMapping(mapping)) {
      setError(
        "Map each title, username, password, notes, and OTP column once before importing.",
      );
      return;
    }
    setRunning(true);
    setError(null);
    cancelled.current = false;
    try {
      const actor = await getVaultImportActor();
      const commands = retry
        ? frozenCommands.current
        : preview.rows.map((row) => {
            const command = toCsvImportCommand({
              source,
              preview,
              row,
              mapping,
              principal,
              expectedActor: actor,
              rowId: crypto.randomUUID(),
              limits,
              browserFillEnabled: enableBrowserFill,
            });
            if (!command) return null;
            const duplicate = existingItems.some(
              (item) =>
                item.displayName === command.body.display_name &&
                item.loginUrls.some((url) =>
                  command.body.login_urls?.includes(url),
                ),
            );
            return duplicate && !createPossibleDuplicates ? null : command;
          });
      if (!retry) frozenCommands.current = commands;
      const outcome = await runCsvImportCommands(
        commands,
        async (command) => {
          try {
            await createVaultItem(command.body, {
              idempotencyKey: command.rowId,
              expectedActor: command.expectedActor,
            });
            return "committed" as const;
          } catch (cause) {
            if (
              cause instanceof VaultImportTransportError &&
              cause.code === "context_changed"
            ) {
              setError(cause.message);
              cancelled.current = true;
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
      );
      await onCommitted();
      setResult(outcome);
      if (outcome.imported + outcome.skipped === commands.length) {
        frozenCommands.current = [];
        limitsRef.current = null;
        setPreview(null);
        setMapping([]);
      }
    } finally {
      setRunning(false);
    }
  };
  return (
    <Credenza open={open} onOpenChange={close}>
      <CredenzaContent className="md:max-w-3xl">
        <CredenzaHeader>
          <CredenzaTitle>Import passwords from CSV</CredenzaTitle>
        </CredenzaHeader>
        <CredenzaBody className="space-y-4 pb-6">
          <p className="text-sm text-muted-foreground">
            This import stays in this browser until you confirm each encrypted
            credential. Passwords and notes are never shown in the preview.
          </p>
          {!preview && (
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
                Choose CSV file
              </Button>
              <input
                ref={fileInput}
                className="hidden"
                type="file"
                accept=".csv,text/csv"
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
                {preview.issues
                  ? `${preview.issues} invalid rows will be skipped.`
                  : ""}
              </p>
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
              <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Masked preview:
                {preview.rows.slice(0, 5).map((row) => (
                  <div key={row.rowNumber}>
                    {maskedRowSummary(row, preview, mapping)}
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Possible duplicates use matching title and URL metadata. They
                are skipped by default; existing credentials are never
                overwritten. OTP data is preserved inactive and requires
                explicit Authenticator setup later.
              </p>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={enableBrowserFill}
                  onCheckedChange={setEnableBrowserFill}
                  aria-label="Enable browser fill for eligible imported logins"
                />
                <span>
                  Enable browser fill only for eligible HTTPS or local
                  destinations. Matching destinations become visible credential
                  metadata.
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-muted-foreground">
                <Switch
                  checked={createPossibleDuplicates}
                  onCheckedChange={setCreatePossibleDuplicates}
                  aria-label="Create possible duplicates separately"
                />
                <span>
                  Create possible duplicates separately. By default matching
                  title and destination records are skipped; imports never
                  overwrite.
                </span>
              </label>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {result && (
            <p className="text-sm">
              Imported {result.imported}; skipped {result.skipped}; failed{" "}
              {result.failed}.
            </p>
          )}
          <div className="flex justify-end gap-2">
            {running && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  cancelled.current = true;
                }}
              >
                <X className="mr-2 h-4 w-4" />
                Stop after current row
              </Button>
            )}
            {preview && (!result || result.failed > 0) && (
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
  if (row.issue) return `Row ${row.rowNumber}: invalid — skipped`;
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
