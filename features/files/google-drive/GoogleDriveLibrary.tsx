"use client";

/**
 * Internal-review browser for the restricted whole-Drive capability.
 *
 * This is intentionally a metadata-only surface. It cannot preview, export,
 * download, sync, or connect an account. The server remains the authority for
 * the exact connection, organization, and internal-review admission.
 */

import { FormEvent, useState } from "react";
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
import { Input } from "@ai-matrx/design-system";
import { GoogleAccountSelect } from "@/features/google-workspace/GoogleAccountSelect";
import { eligibleGoogleConnections } from "@/features/google-workspace/connection";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import {
  browseGoogleDrive,
  checkGoogleDriveFileAccess,
  type DriveBrowsePage,
  type DriveFileMetadata,
} from "@/features/marketing/google/service";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";

const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

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

export function GoogleDriveLibrary() {
  const { organizationId, organizationState } = useOrganizationRequired();
  const inventory = useGoogleConnectionInventory();
  const [connectionId, setConnectionId] = useState("");
  const [search, setSearch] = useState("");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [page, setPage] = useState<DriveBrowsePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [access, setAccess] = useState<DriveFileMetadata | null>(null);
  const [checkingFileId, setCheckingFileId] = useState<string | null>(null);

  const connections = eligibleGoogleConnections(
    inventory.data?.connections ?? [],
    "drive-browse",
    connectionId,
  );

  async function load(
    next: {
      folderId?: string | null;
      folderName?: string | null;
      pageToken?: string | null;
      search?: string;
    } = {},
  ) {
    if (!organizationId || !connectionId) return;
    const nextFolderId = next.folderId === undefined ? folderId : next.folderId;
    const nextSearch = next.search === undefined ? search : next.search;
    setLoading(true);
    setError(null);
    setAccess(null);
    try {
      const result = await browseGoogleDrive({
        organizationId,
        connectionId,
        folderId: nextFolderId,
        pageToken: next.pageToken ?? null,
        search: nextSearch,
      });
      setFolderId(nextFolderId);
      setFolderName(
        next.folderName === undefined ? folderName : next.folderName,
      );
      setPage(result);
    } catch (caught) {
      setPage(null);
      setError(extractErrorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  function chooseConnection(id: string) {
    setConnectionId(id);
    setFolderId(null);
    setFolderName(null);
    setPage(null);
    setAccess(null);
    setError(null);
  }

  async function checkAccess(fileId: string) {
    if (!organizationId || !connectionId) return;
    setCheckingFileId(fileId);
    setError(null);
    setAccess(null);
    try {
      setAccess(
        await checkGoogleDriveFileAccess({
          organizationId,
          connectionId,
          fileId,
        }),
      );
    } catch (caught) {
      setError(extractErrorMessage(caught));
    } finally {
      setCheckingFileId(null);
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void load({ folderId: null, folderName: null, search });
  }

  if (organizationState !== "ready") {
    return <OrganizationContextNotice what="Google Drive review" />;
  }

  return (
    <main
      className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-5 p-4 sm:p-6"
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
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Search or browse one connected account’s file metadata. This does
              not open, download, export, or save any file.
            </p>
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

      {inventory.isLoading ? (
        <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
          Loading connected Google accounts…
        </p>
      ) : inventory.isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 text-sm text-foreground">
          Connected Google accounts could not be loaded. Try again from the
          Google connection screen.
          <ErrorAlchemyMenu />
        </div>
      ) : connections.length === 0 ? (
        <p className="rounded-xl border border-border p-5 text-sm text-muted-foreground">
          No connected Google account currently has Drive browse access for this
          internal test. The Files library cannot request or add that access
          here.
        </p>
      ) : (
        <section className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
          <GoogleAccountSelect
            connections={connections}
            connectionId={connectionId}
            onConnectionChange={chooseConnection}
            label="Google account to review"
            disabled={loading || checkingFileId !== null}
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
              placeholder="Search file names"
              aria-label="Search Google Drive file names"
              maxLength={200}
            />
            <Button
              type="submit"
              disabled={!connectionId || loading}
              className="min-h-10"
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Search
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!connectionId || loading}
              onClick={() =>
                void load({ folderId: null, folderName: null, search: "" })
              }
            >
              Browse My Drive
            </Button>
          </form>
          {folderId ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void load({ folderId: null, folderName: null })}
                disabled={loading}
              >
                <ChevronLeft className="mr-1 h-4 w-4" /> My Drive
              </Button>
              <span>/ {folderName ?? "Folder"}</span>
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
      {page?.incomplete_search ? (
        <p
          className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-foreground"
          data-google-drive-incomplete
        >
          Google marked this result incomplete. Refine the search before relying
          on it as a complete list.
        </p>
      ) : null}
      {access ? (
        <div
          className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm"
          data-google-drive-access-confirmed
        >
          <p className="font-medium">Access confirmed right now</p>
          <p className="mt-1 text-muted-foreground">
            {access.file.name} is accessible through {access.source_account}.
            Metadata only; the file was not opened.
          </p>
        </div>
      ) : null}
      {page ? (
        <section
          className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
          aria-label="Google Drive metadata results"
        >
          <div className="border-b border-border px-5 py-3 text-sm text-muted-foreground">
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
                        {file.shared_drive ? "Shared drive" : "My Drive"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {isFolder ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={loading}
                          onClick={() =>
                            void load({
                              folderId: file.id,
                              folderName: file.name,
                            })
                          }
                        >
                          Browse folder
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={checkingFileId !== null}
                          onClick={() => void checkAccess(file.id)}
                        >
                          {checkingFileId === file.id ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : null}{" "}
                          Check access
                        </Button>
                      )}
                      {file.web_view_link ? (
                        <a
                          href={file.web_view_link}
                          target="_blank"
                          rel="noreferrer"
                          className={cn(
                            "inline-flex h-9 items-center rounded-md px-3 text-sm font-medium text-primary hover:bg-accent",
                            checkingFileId === file.id &&
                              "pointer-events-none opacity-50",
                          )}
                        >
                          Google <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
                        </a>
                      ) : null}
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
                type="button"
                variant="outline"
                disabled={loading}
                onClick={() => void load({ pageToken: page.next_page_token })}
              >
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}{" "}
                Load next page
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </main>
  );
}
