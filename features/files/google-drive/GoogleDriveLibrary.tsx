"use client";

/**
 * Internal-review browser and explicit selected-file import for the
 * restricted whole-Drive capability.
 */

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ExternalLink,
  File,
  Folder,
  Loader2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { Input } from "@ai-matrx/design-system/controls";
import { GoogleAccountSelect } from "@/features/google-workspace/GoogleAccountSelect";
import { eligibleGoogleConnections } from "@/features/google-workspace/connection";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import {
  useGoogleCapabilities,
  useGoogleConnectionInventory,
} from "@/features/marketing/google/hooks";
import {
  browseGoogleDrive,
  checkGoogleDriveFileAccess,
  importSelectedGoogleDriveFile,
  type DriveBrowsePage,
  type DriveFileMetadata,
  type DriveImportResult,
} from "@/features/marketing/google/service";
import { openFilePreview } from "@/features/files/components/preview/openFilePreview";
import { storageDestinationPath, validateStorageDestinationFolderPath } from "@/features/files/storage-sources/service";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationName } from "@/lib/redux/slices/appContextSlice";
import { extractErrorMessage } from "@/utils/errors";
import {
  allAccessibleDriveBrowseState,
  folderDriveBrowseCriteria,
  type DriveBrowseCriteria,
  type DriveBrowseCapability,
  driveBrowseIsAvailable,
  driveFileTypeLabel,
  driveFileResourceKey,
  incompleteSearchNotice,
  nextDriveBrowseInput,
  parseDriveSearchSubmission,
  openFreshGoogleDriveFile,
  openGoogleDriveBlankTab,
} from "./drive-browser";

const NO_ORGANIZATION_FOR_CONNECTION =
  "This Google account is your own (not filed under an organization) and the Drive service still needs an organization for the request. Choose one from the organization picker in the header and try again.";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const GOOGLE_NATIVE_EXTENSIONS: Record<string, string> = {
  "application/vnd.google-apps.document": ".docx",
  "application/vnd.google-apps.spreadsheet": ".xlsx",
  "application/vnd.google-apps.presentation": ".pptx",
  "application/vnd.google-apps.drawing": ".pdf",
  "application/vnd.google-apps.script": ".json",
};

function importableFile(file: DriveBrowsePage["files"][number]): boolean {
  return !file.mime_type.startsWith("application/vnd.google-apps.") ||
    file.mime_type in GOOGLE_NATIVE_EXTENSIONS;
}

function suggestedImportPath(file: DriveBrowsePage["files"][number]): string {
  const extension = GOOGLE_NATIVE_EXTENSIONS[file.mime_type];
  const name = extension && !file.name.toLowerCase().endsWith(extension)
    ? `${file.name}${extension}`
    : file.name;
  return storageDestinationPath("My Files/Imports", name);
}

type ImportSelection = {
  file: DriveBrowsePage["files"][number];
  connectionId: string;
  sourceAccount: string;
  resourceKey: string | null;
};

type ImportReceipt = {
  result: DriveImportResult;
  sourceAccount: string;
  fileName: string;
  organizationId: string;
};

function dateLabel(value: string | null): string {
  if (!value) return "Date not provided";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date not provided"
    : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function ownerLabel(
  owners: DriveBrowsePage["files"][number]["owners"],
): string {
  const labels = owners
    .map((owner) => owner.display_name ?? owner.email)
    .filter((value): value is string => Boolean(value));
  return labels.length ? labels.join(", ") : "Owner not provided";
}

export type GoogleDriveLibraryEnvironment = {
  selectedOrganizationId: string | null;
  selectedOrganizationName: string | null;
  connections: GoogleConnectionSummary[];
  driveBrowse: DriveBrowseCapability | undefined;
  loadingConnections: boolean;
  connectionsError: boolean;
  browse: typeof browseGoogleDrive;
  checkAccess: typeof checkGoogleDriveFileAccess;
  importFile: typeof importSelectedGoogleDriveFile;
};

/** Live container; a separate injected seat permits localhost interaction without provider calls. */
export function GoogleDriveLibrary() {
  const { organizationId: selectedOrganizationId } = useOrganizationRequired();
  const selectedOrganizationName = useAppSelector(selectOrganizationName);
  const inventory = useGoogleConnectionInventory();
  const capabilities = useGoogleCapabilities();
  return <GoogleDriveLibraryContent environment={{
    selectedOrganizationId,
    selectedOrganizationName,
    connections: inventory.data?.connections ?? [],
    driveBrowse: capabilities.data?.find((capability) => capability.key === "drive_browse"),
    loadingConnections: Boolean(inventory.isLoading || capabilities.isLoading),
    connectionsError: Boolean(inventory.isError || capabilities.isError),
    browse: browseGoogleDrive,
    checkAccess: checkGoogleDriveFileAccess,
    importFile: importSelectedGoogleDriveFile,
  }} />;
}

export function GoogleDriveLibraryContent({ environment }: { environment: GoogleDriveLibraryEnvironment }) {
  const { selectedOrganizationId, selectedOrganizationName } = environment;
  const [connectionId, setConnectionId] = useState("");
  const [search, setSearch] = useState("");
  const [criteria, setCriteria] = useState<DriveBrowseCriteria>(
    allAccessibleDriveBrowseState().criteria,
  );
  const [page, setPage] = useState<DriveBrowsePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<DriveFileMetadata | null>(null);
  const [checkingFileId, setCheckingFileId] = useState<string | null>(null);
  const [importSelection, setImportSelection] = useState<ImportSelection | null>(null);
  const [destinationPath, setDestinationPath] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ImportReceipt | null>(null);
  const [attemptedImportKeys, setAttemptedImportKeys] = useState<string[]>([]);
  const inFlightImport = useRef(false);
  const browseGeneration = useRef(0);
  const accessGeneration = useRef(0);
  const previousOrganizationId = useRef(selectedOrganizationId);
  const [unconfirmedAttempt, setUnconfirmedAttempt] = useState<string | null>(null);

  const connections = eligibleGoogleConnections(
    environment.connections,
    "drive-browse",
    connectionId,
  );
  const selectedConnection = connections.find(
    (connection) => connection.id === connectionId,
  );
  const organizationId =
    selectedConnection?.organization_id ?? selectedOrganizationId ?? null;
  const driveBrowse = environment.driveBrowse;
  const capabilityAvailable = driveBrowseIsAvailable(driveBrowse);

  useEffect(() => {
    if (previousOrganizationId.current === selectedOrganizationId) return;
    previousOrganizationId.current = selectedOrganizationId;
    browseGeneration.current += 1;
    accessGeneration.current += 1;
    setLoading(false);
    setCheckingFileId(null);
    setPage(null);
    setAccess(null);
    setImportSelection(null);
    setReceipt(null);
    setError(null);
  }, [selectedOrganizationId]);

  async function load(
    next: {
      pageToken?: string | null;
      criteria?: DriveBrowseCriteria;
    } = {},
  ) {
    if (!connectionId || inFlightImport.current) return;
    if (!organizationId) {
      setError(NO_ORGANIZATION_FOR_CONNECTION);
      return;
    }
    const nextCriteria = next.criteria ?? criteria;
    const generation = ++browseGeneration.current;
    accessGeneration.current += 1;
    setLoading(true);
    setError(null);
    setAccess(null);
    setImportSelection(null);
    try {
      const result = await environment.browse({
        organizationId,
        connectionId,
        ...nextDriveBrowseInput(nextCriteria, next.pageToken),
      });
      if (result.connection_id !== connectionId) {
        throw new Error("Google Drive returned files from a different account.");
      }
      if (generation !== browseGeneration.current) return;
      setCriteria(nextCriteria);
      setPage(result);
    } catch (caught) {
      if (generation !== browseGeneration.current) return;
      setPage(null);
      setError(extractErrorMessage(caught));
    } finally {
      if (generation === browseGeneration.current) setLoading(false);
    }
  }

  function chooseConnection(id: string) {
    if (inFlightImport.current) return;
    browseGeneration.current += 1;
    accessGeneration.current += 1;
    setLoading(false);
    setConnectionId(id);
    const reset = allAccessibleDriveBrowseState();
    setSearch(reset.search);
    setCriteria(reset.criteria);
    setPage(null);
    setAccess(null);
    setError(null);
    setImportSelection(null);
    setDestinationPath("");
    setImportError(null);
    setReceipt(null);
  }

  function selectForImport(file: DriveBrowsePage["files"][number]) {
    if (!page || page.connection_id !== connectionId || !importableFile(file) || inFlightImport.current) return;
    try {
      setDestinationPath(suggestedImportPath(file));
      setImportSelection({ file, connectionId, sourceAccount: page.source_account,
        resourceKey: driveFileResourceKey(file, criteria) });
      setImportError(null);
    } catch (caught) {
      setImportError(extractErrorMessage(caught));
    }
  }

  async function importSelected() {
    const selected = importSelection;
    const destinationOrganizationId = selectedOrganizationId;
    if (!selected || inFlightImport.current) return;
    if (!destinationOrganizationId) {
      setImportError("Choose the Matrx Files organization in the header before importing.");
      return;
    }
    if (selected.connectionId !== connectionId || page?.connection_id !== connectionId ||
        page.source_account !== selected.sourceAccount ||
        !page.files.some((file) => file.id === selected.file.id)) {
      setImportError("The Google account or file selection changed. Select the file again.");
      return;
    }
    const slash = destinationPath.lastIndexOf("/");
    const folder = slash < 0 ? "" : destinationPath.slice(0, slash);
    const name = destinationPath.slice(slash + 1);
    const exportExtension = GOOGLE_NATIVE_EXTENSIONS[selected.file.mime_type];
    try {
      if (!folder || validateStorageDestinationFolderPath(folder) ||
          storageDestinationPath(folder, name) !== destinationPath) {
        throw new Error("Choose a valid Matrx Files destination path.");
      }
      if (exportExtension && !name.toLowerCase().endsWith(exportExtension)) {
        throw new Error(`This Google file is exported as ${exportExtension}. Keep that file extension.`);
      }
    } catch (caught) {
      setImportError(extractErrorMessage(caught));
      return;
    }
    const attemptKey = JSON.stringify([
      destinationOrganizationId, selected.connectionId, selected.file.id, destinationPath,
    ]);
    if (attemptedImportKeys.includes(attemptKey)) {
      setImportError("This import was already requested. Check Matrx Files before choosing another destination.");
      return;
    }
    setAttemptedImportKeys((current) => [...current, attemptKey]);
    inFlightImport.current = true;
    setImporting(true);
    setImportError(null);
    try {
      const result = await environment.importFile({
        organizationId: destinationOrganizationId,
        connectionId: selected.connectionId,
        fileId: selected.file.id,
        filePath: destinationPath,
        resourceKey: selected.resourceKey,
      });
      setReceipt({
        result,
        sourceAccount: selected.sourceAccount,
        fileName: selected.file.name,
        organizationId: destinationOrganizationId,
      });
      setUnconfirmedAttempt(null);
      setImportSelection(null);
    } catch (caught) {
      setImportError(`${extractErrorMessage(caught)} Check Matrx Files before another import.`);
      setUnconfirmedAttempt(`${selected.file.name} from ${selected.sourceAccount} to ${destinationPath} was not confirmed. Check Matrx Files before another import.`);
    } finally {
      inFlightImport.current = false;
      setImporting(false);
    }
  }

  const selectedAttemptKey = importSelection && selectedOrganizationId
    ? JSON.stringify([selectedOrganizationId, importSelection.connectionId, importSelection.file.id, destinationPath])
    : null;
  const alreadyAttempted = selectedAttemptKey !== null && attemptedImportKeys.includes(selectedAttemptKey);

  async function checkAccess(fileId: string, resourceKey: string | null) {
    if (!connectionId) return;
    if (!organizationId) {
      setError(NO_ORGANIZATION_FOR_CONNECTION);
      return;
    }
    const generation = ++accessGeneration.current;
    setCheckingFileId(fileId);
    setError(null);
    setAccess(null);
    try {
      const result = await environment.checkAccess({
          organizationId,
          connectionId,
          fileId,
          resourceKey,
        });
      if (generation !== accessGeneration.current) return;
      if (!result.accessible || result.connection_id !== connectionId || result.file.id !== fileId) {
        throw new Error("Google Drive could not confirm access to the selected file.");
      }
      setAccess(result);
    } catch (caught) {
      if (generation === accessGeneration.current) setError(extractErrorMessage(caught));
    } finally {
      if (generation === accessGeneration.current) setCheckingFileId(null);
    }
  }

  async function openInGoogle(fileId: string, resourceKey: string | null) {
    if (!connectionId) return;
    if (!organizationId) {
      setError(NO_ORGANIZATION_FOR_CONNECTION);
      return;
    }
    const tab = openGoogleDriveBlankTab((url, target) =>
      window.open(url, target),
    );
    if (!tab) {
      setError(
        "Your browser blocked the new Google Drive tab. Allow popups and try again.",
      );
      return;
    }
    const generation = ++accessGeneration.current;
    setCheckingFileId(fileId);
    setError(null);
    setAccess(null);
    try {
      await openFreshGoogleDriveFile({
        selectedConnectionId: connectionId,
        check: () =>
          environment.checkAccess({ organizationId, connectionId, fileId, resourceKey }),
        expectedFileId: fileId,
        isCurrent: () => generation === accessGeneration.current,
        tab,
      });
    } catch (caught) {
      if (generation === accessGeneration.current) setError(extractErrorMessage(caught));
    } finally {
      if (generation === accessGeneration.current) setCheckingFileId(null);
    }
  }

  function browseAllAccessibleFiles() {
    const reset = allAccessibleDriveBrowseState();
    setSearch(reset.search);
    void load({ criteria: reset.criteria });
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submission = parseDriveSearchSubmission(search);
    if (submission.kind === "invalid") {
      browseGeneration.current += 1;
      accessGeneration.current += 1;
      setPage(null);
      setImportSelection(null);
      setAccess(null);
      setLoading(false);
      setCheckingFileId(null);
      setError(submission.message);
      return;
    }
    if (submission.kind === "name") {
      void load({ criteria: { search: submission.search, folderId: null, folderName: null } });
      return;
    }
    void lookupLinkedFile(submission.fileId, submission.resourceKey);
  }

  async function lookupLinkedFile(fileId: string, resourceKey: string | null) {
    if (!connectionId || inFlightImport.current) return;
    if (!organizationId) {
      setError(NO_ORGANIZATION_FOR_CONNECTION);
      return;
    }
    const generation = ++browseGeneration.current;
    accessGeneration.current += 1;
    setLoading(true);
    setError(null);
    setPage(null);
    setAccess(null);
    setImportSelection(null);
    try {
      const result = await environment.checkAccess({ organizationId, connectionId, fileId, resourceKey });
      if (generation !== browseGeneration.current) return;
      if (!result.accessible || result.connection_id !== connectionId || result.file.id !== fileId) {
        throw new Error("Google Drive could not confirm this file in the selected account.");
      }
      setCriteria({ search: "", folderId: null, folderName: null, linkedFileId: fileId, resourceKey });
      setPage({
        connection_id: result.connection_id,
        source_account: result.source_account,
        source_owner_type: result.source_owner_type,
        source_owner_id: result.source_owner_id,
        files: [result.file],
        next_page_token: null,
        incomplete_search: false,
      });
    } catch (caught) {
      if (generation === browseGeneration.current) setError(extractErrorMessage(caught));
    } finally {
      if (generation === browseGeneration.current) setLoading(false);
    }
  }

  return (
    <main
      className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-5 px-4 pb-6 pt-[calc(var(--shell-header-h)+1rem)] sm:px-6"
      data-google-drive-library
    >
      <header className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <ShieldCheck className="h-4 w-4" /> Internal test
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">
              Google Drive
            </h1>
          </div>
          {page ? (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Source:{" "}
              <span className="font-medium text-foreground">
                {page.source_account}
              </span>
              {" · "}
              {page.source_owner_type} connection
            </p>
          ) : null}
        </div>
      </header>

      {environment.loadingConnections ? (
        <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
          Loading connected Google accounts…
        </p>
      ) : environment.connectionsError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-foreground">
          Google Drive access could not be checked. Try again from the Google
          connection screen.
          <ErrorAlchemyMenu />
        </div>
      ) : !capabilityAvailable ? (
        <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
          Drive browsing is unavailable for this account.
          {driveBrowse?.remedy
            ? ` ${driveBrowse.remedy}`
            : ""}
        </p>
      ) : connections.length === 0 ? (
        <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
          No connected Google account has Drive access.
        </p>
      ) : (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
          <GoogleAccountSelect
            connections={connections}
            connectionId={connectionId}
            onConnectionChange={chooseConnection}
            label="Google account to review"
            disabled={loading || checkingFileId !== null || importing}
            requireExplicitSelection
          />
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={submitSearch}
          >
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              disabled={!connectionId || loading}
              placeholder="File name or Google link"
              aria-label="Search Google Drive file names or paste a link"
            />
            <Button
              icon={loading ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Search />
              )}
              variant="primary"
              type="submit"
              disabled={!connectionId || loading}
            >
              Search
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!connectionId || loading}
              onClick={browseAllAccessibleFiles}
            >
              Browse all accessible Drive files
            </Button>
          </form>
          {criteria.folderId ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button
                icon={<ChevronLeft />}
                type="button"
                variant="quiet"
                onClick={browseAllAccessibleFiles}
                disabled={loading}
              > All accessible files
              </Button>
              <span>/ {criteria.folderName ?? "Folder"}</span>
            </div>
          ) : null}
        </section>
      )}

      {error ? (
        <div
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-foreground"
          data-google-drive-error
        >
          {error}
          <ErrorAlchemyMenu error={error} />
        </div>
      ) : null}
      {incompleteSearchNotice(page) ? (
        <p
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground"
          data-google-drive-incomplete
        >
          {incompleteSearchNotice(page)}
        </p>
      ) : null}
      {access ? (
        <div
          className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"
          data-google-drive-access-confirmed
        >
          <p className="font-medium">Access confirmed right now</p>
          <p className="mt-1 text-muted-foreground">
            {access.file.name} · {access.source_account} · No content read.
          </p>
        </div>
      ) : null}
      {unconfirmedAttempt ? (
        <div role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <p className="font-medium">Import not confirmed</p>
          <p>{unconfirmedAttempt}</p>
          <ErrorAlchemyMenu error={unconfirmedAttempt} />
        </div>
      ) : null}
      {importSelection ? (
        <section className="space-y-3 rounded-xl border border-primary/30 bg-card p-5 shadow-sm" aria-label="Import selected Google Drive file">
          <h2 className="font-semibold">Save a copy to Matrx Files</h2>
          <p className="text-sm text-muted-foreground">
            {importSelection.file.name} · {importSelection.sourceAccount}
          </p>
          <p className="text-sm text-muted-foreground">
            Destination organization: {selectedOrganizationId ? selectedOrganizationName ?? "Selected in header" : "Choose one in the header"}
          </p>
          <label className="block space-y-1 text-sm font-medium">
            <span>Matrx Files path</span>
            <Input value={destinationPath} onChange={(event) => setDestinationPath(event.target.value)} disabled={importing} aria-label="Matrx Files destination path" />
          </label>
          <p className="text-xs text-muted-foreground">
            Import saves a copy in Matrx Files.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button icon={importing ? <Loader2 className="animate-spin" /> : null} variant="primary" type="button" onClick={() => void importSelected()} disabled={importing || !selectedOrganizationId || alreadyAttempted}> Import selected file
            </Button>
            <Button type="button" variant="outline" disabled={importing} onClick={() => setImportSelection(null)}>Cancel</Button>
          </div>
          {importError ? <div role="alert" className="text-sm text-destructive">{importError}<ErrorAlchemyMenu error={importError} /></div> : null}
        </section>
      ) : null}
      {receipt ? (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm" aria-label="Saved Matrx Files copy">
          <p className="font-medium">Saved to Matrx Files</p>
          <p className="mt-1 text-muted-foreground">{receipt.fileName} from {receipt.sourceAccount} · {receipt.result.file_path}</p>
          <Button type="button" variant="outline" className="mt-3" onClick={() => openFilePreview(receipt.result.file_id)}>Open saved file</Button>
        </section>
      ) : null}
      {page ? (
        <section
          className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
          aria-label="Google Drive metadata results"
        >
          <div className="border-b border-border px-5 py-3 text-sm text-muted-foreground">
            {/* read-gate-exempt: page is set only by a browse that succeeded (a failed browse clears it); `error` may be an unrelated access check, which must not hide these results */}
            {page.files.length} result{page.files.length === 1 ? "" : "s"} on
            this page
          </div>
          {page.files.length ? (
            <ul className="divide-y divide-border">
              {page.files.map((file) => {
                const isFolder = file.mime_type === FOLDER_MIME_TYPE;
                return (
                  <li
                    key={file.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center"
                  >
                    {isFolder ? (
                      <Folder className="h-5 w-5 shrink-0 text-amber-500" />
                    ) : (
                      <File className="h-5 w-5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">
                        {file.name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {ownerLabel(file.owners)} · Modified{" "}
                        {dateLabel(file.modified_at)} ·{" "}
                        {driveFileTypeLabel(file)} ·{" "}
                        {file.shared_drive ? "Shared drive" : "My Drive"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {isFolder ? (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={loading}
                          onClick={() =>
                            void load({
                              criteria: folderDriveBrowseCriteria(
                                file.id,
                                file.name,
                                driveFileResourceKey(file, criteria),
                              ),
                            })
                          }
                        >
                          Browse folder
                        </Button>
                      ) : (
                        <Button
                          icon={checkingFileId === file.id ? (
                            <Loader2 className="animate-spin" />
                          ) : null}
                          type="button"
                          variant="outline"
                          disabled={checkingFileId !== null}
                          onClick={() => void checkAccess(file.id, driveFileResourceKey(file, criteria))}
                        >{" "}
                          Check access
                        </Button>
                      )}
                      {!isFolder && importableFile(file) ? (
                        <Button variant="primary" type="button" disabled={importing} onClick={() => selectForImport(file)}>
                          Save to Matrx Files
                        </Button>
                      ) : !isFolder ? (
                        <span className="self-center text-xs text-muted-foreground">Import unavailable for this file type</span>
                      ) : null}
                      <Button
                        icon={checkingFileId === file.id ? (
                          <Loader2 className="animate-spin" />
                        ) : (
                          // new-tab-icon: openInGoogle opens the file in a new tab (window.open in openGoogleDriveBlankTab); never disabled — each click opens its own tab
                          <ExternalLink />
                        )}
                        type="button"
                        variant="quiet"
                        onClick={() => void openInGoogle(file.id, driveFileResourceKey(file, criteria))}
                      >
                        Open in Google
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="p-5 text-sm text-muted-foreground">
              No files were returned for this account and query.
            </p>
          )}
          {page.next_page_token ? (
            <div className="border-t border-border p-4">
              <Button
                icon={loading ? (
                  <Loader2 className="animate-spin" />
                ) : null}
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => void load({ pageToken: page.next_page_token })}
              >{" "}
                Load next page
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
