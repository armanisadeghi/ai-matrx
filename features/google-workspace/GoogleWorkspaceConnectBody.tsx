"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, ExternalLink, Loader2, Mail, Plus } from "lucide-react";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { toast, recordToast } from "@/lib/toast";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import {
  isGoogleAuthorizationCancelled,
  useGoogleAPI,
} from "@/providers/google-provider/GoogleApiProvider";
import {
  GOOGLE_WORKSPACE_FILE_SCOPES,
  GOOGLE_WORKSPACE_SEND_SCOPES,
  GOOGLE_SCOPE,
} from "@/lib/googleScopes";
import {
  useConnectGoogle,
  useGoogleConnectionInventory,
} from "@/features/marketing/google/hooks";
import { registerSelectedGoogleFile } from "@/features/google-workspace/service";
import {
  OPEN_GOOGLE_RECORD_CONSEQUENCE,
  OpenGoogleDocumentRecordButton,
  hasGoogleDocumentRecord,
  pickedGoogleRecordResource,
} from "@/features/google-workspace/documents/openRecord";
import {
  googleWorkspaceFileType,
  googleWorkspacePickLabel,
} from "@/features/google-workspace/resource-types";
import { isGoogleWorkspaceFileRow } from "@/features/marketing/google/types";
import { GoogleAccountSelect } from "@/features/google-workspace/GoogleAccountSelect";
import {
  eligibleGoogleConnections,
  preferredGoogleConnectionId,
  rememberGoogleConnection,
} from "@/features/google-workspace/connection";
import {
  pickGoogleDriveFiles,
  pickGoogleWorkspaceFile,
} from "@/lib/googlePicker";
import type { SelectedGoogleFile } from "@/features/google-workspace/types";
import { extractErrorMessage } from "@/utils/errors";
import {
  importStorageSourceFiles,
  safeStorageBasename,
} from "@/features/files/storage-sources/service";
import { getGoogleDrivePickerToken } from "@/features/google-workspace/drivePickerToken";
import {
  disposeGoogleConnectCallbackGroup,
  emitGoogleConnectEvent,
} from "@/features/overlays/callbacks/googleConnectWindow";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { awaitEffectiveOrganizationId } from "@/features/organizations/awaitWorkspace";
import { isGoogleAuthorizationActionDisabled } from "./authorizationReadiness";
import { useGoogleAuthorizationWindow } from "@/providers/google-provider/useGoogleAuthorizationWindow";
import {
  enforceStorageSelectionMode,
  matchStorageAccept,
} from "@/features/files/storage-sources/accept";
import type {
  CanonicalStorageImport,
  StorageImportFailure,
  StorageImportSelection,
} from "@/features/files/storage-sources/types";
import { attachChildToFolder, upsertFiles } from "@/features/files/redux/slice";

export interface GoogleWorkspaceConnectBodyProps {
  onClose: () => void;
  /** Fired whenever the user registers a file, so a caller can attach it. */
  onFilesPicked?: (files: SelectedGoogleFile[]) => void;
  /** Optional one-line reason, e.g. "to attach a doc to this message". */
  reason?: string | null;
  mode?: "workspace" | "drive-import";
  callbackGroupId?: string | null;
  initialConnectionId?: string | null;
  /** Logical Matrx Files folder selected by the invoking acquisition surface. */
  importDestinationFolderPath?: string | null;
  accept?: string | null;
  multiple?: boolean;
  /** Window host hook used to make X/Escape obey import settlement. */
  registerCloseRequest?: (request: (() => void) | null) => void;
}

/** Preserve the overlay's close notification for any WindowPanel composition. */
export async function closeGoogleWorkspaceConnect(
  callbackGroupId: string | null | undefined,
  onClose: () => void,
): Promise<void> {
  try {
    await emitGoogleConnectEvent(callbackGroupId, { type: "window-close" });
  } finally {
    disposeGoogleConnectCallbackGroup(callbackGroupId);
    onClose();
  }
}

/**
 * The canonical connect, account-selection, and Picker/import flow shared by
 * Google surfaces. It intentionally owns no window chrome so it can also be
 * composed into the Workspace overview and settings surfaces.
 */
export function GoogleWorkspaceConnectBody(
  props: GoogleWorkspaceConnectBodyProps,
) {
  return (
    <LazyGoogleAPIProvider scopes={[...GOOGLE_WORKSPACE_FILE_SCOPES]}>
      <GoogleWorkspaceConnectBodyContent {...props} />
    </LazyGoogleAPIProvider>
  );
}

function GoogleWorkspaceConnectBodyContent({
  onClose,
  onFilesPicked,
  reason,
  mode = "workspace",
  callbackGroupId,
  initialConnectionId,
  importDestinationFolderPath,
  accept,
  multiple = true,
  registerCloseRequest,
}: GoogleWorkspaceConnectBodyProps) {
  const google = useGoogleAPI();
  // 🚨 ONE Google authorization window per PERSON — never a per-component
  // lock, never the raw provider primitive (V-23 NEW-3, lane F-103).
  const googleAuth = useGoogleAuthorizationWindow();
  const organizationContextId = useAppSelector(selectOrganizationId);
  const dispatch = useAppDispatch();
  const connectGoogle = useConnectGoogle();
  const inventory = useGoogleConnectionInventory();
  const [busy, setBusy] = useState<string | null>(null);
  const [clickedFileId, setClickedFileId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(() => initialConnectionId ?? preferredGoogleConnectionId("workspace"));
  const [driveFailures, setDriveFailures] = useState<StorageImportFailure[]>(
    [],
  );
  const [driveCollisionNames, setDriveCollisionNames] = useState<
    Record<string, string>
  >({});
  const [driveRetryError, setDriveRetryError] = useState<string | null>(null);
  const [driveRetained, setDriveRetained] = useState<
    Map<string, CanonicalStorageImport>
  >(new Map());
  const [driveDeliveryError, setDriveDeliveryError] = useState<string | null>(
    null,
  );
  const driveRetainedRef = useRef<Map<string, CanonicalStorageImport>>(
    new Map(),
  );
  const driveCancelRequestedRef = useRef(false);
  // A terminal request owns this body instance until it settles. Every close
  // source joins the same promise; a newly mounted import session gets a fresh
  // latch, so late work from this session cannot close the next one.
  const driveTerminalSettlementRef = useRef<Promise<void> | null>(null);
  /**
   * 🚨 F-74 — a fresh pick hands its Record straight to the open control (F-69,
   * `openRecord.tsx`). The inventory row `files` renders from
   * (`users.integration_connection_resources`) has never carried `record_id` —
   * that field lives only on the registration response
   * (`SelectedGoogleFile.recordId`, aidream F-57/R29) — so without this, every
   * file on this list, including one picked seconds ago, takes the slower
   * read-then-refresh leg `useOpenGoogleDocumentRecord` falls back to. Keyed by
   * the picked-resource id, which is stable across the `inventory.refetch()`
   * that follows registration.
   *
   * 🚨 F-77 (V-21 N1) — THE SERVER'S TWO REASONS RIDE ALONG TOO. A registration
   * that could not write the Record answers `record_id: null` plus a plain
   * `record_absent_reason` sentence saying why (no Record table for this file
   * type, no organization named, or the write itself failed); one that could
   * still answers an optional `record_sync_status_reason` when the status it
   * kept is not the healthy one. Both used to be parsed off the response
   * (`service.ts`) and thrown away here — so a person was told a file was
   * "ready to use" and offered a door to a Record that was never made. Carried
   * so the row can say the truth instead of a claim the server never made.
   */
  const [freshRecords, setFreshRecords] = useState<
    Record<
      string,
      {
        record_id: string | null;
        record_sync_status: string | null;
        record_sync_status_reason: string | null;
        record_absent_reason: string | null;
      }
    >
  >({});

  const connections = useMemo(
    () =>
      eligibleGoogleConnections(
        inventory.data?.connections ?? [],
        "workspace",
        selectedConnectionId,
      ),
    [inventory.data?.connections, selectedConnectionId],
  );
  const connection =
    connections.find((row) => row.id === selectedConnectionId) ??
    connections[0] ??
    null;

  const canSend = Boolean(connection?.scopes.includes(GOOGLE_SCOPE.gmailSend));
  const authorizationActionDisabled = isGoogleAuthorizationActionDisabled(
    google.isGoogleLoaded,
    busy,
  );
  const files = useMemo(() => {
    const rows = inventory.data?.resources ?? [];
    // The file types come from the ONE record, so a type the server ships is
    // never filtered out of a person's own connected-files list (V13-3).
    return rows
      .filter((row) => row.connection_id === connection?.id)
      .filter(isGoogleWorkspaceFileRow);
  }, [connection?.id, inventory.data?.resources]);

  const selectConnection = useCallback((connectionId: string) => {
    setSelectedConnectionId(connectionId);
    rememberGoogleConnection("workspace", connectionId);
  }, []);

  const run = useCallback(async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    try {
      await work();
    } catch (cause) {
      if (isGoogleAuthorizationCancelled(cause)) {
        toast.info("Google authorization cancelled");
        return;
      }
      toast.error(extractErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }, []);

  const upsertCanonical = useCallback(
    (imports: CanonicalStorageImport[]) => {
      const canonical = imports.map((item) => item.file);
      dispatch(upsertFiles(canonical));
      for (const file of canonical) {
        dispatch(
          attachChildToFolder({
            parentFolderId: file.parentFolderId,
            kind: "file",
            id: file.id,
          }),
        );
      }
    },
    [dispatch],
  );

  const finishDriveImport = useCallback((): Promise<void> => {
    if (driveTerminalSettlementRef.current) {
      return driveTerminalSettlementRef.current;
    }
    const settlement = closeGoogleWorkspaceConnect(
      callbackGroupId,
      onClose,
    ).catch((cause: unknown) => {
      toast.error(extractErrorMessage(cause));
    });
    driveTerminalSettlementRef.current = settlement;
    return settlement;
  }, [callbackGroupId, onClose]);

  const deliverDriveImports = useCallback(
    async (imports: CanonicalStorageImport[]): Promise<boolean> => {
      if (!imports.length) return true;
      upsertCanonical(imports);
      const waiting = new Map(driveRetainedRef.current);
      for (const imported of imports) waiting.set(imported.fileId, imported);
      driveRetainedRef.current = waiting;
      setDriveRetained(waiting);
      try {
        await emitGoogleConnectEvent(callbackGroupId, {
          type: "drive-imported",
          files: imports,
          failures: [],
        });
        const acknowledged = new Map(driveRetainedRef.current);
        for (const imported of imports) acknowledged.delete(imported.fileId);
        driveRetainedRef.current = acknowledged;
        setDriveRetained(acknowledged);
        if (acknowledged.size === 0) setDriveDeliveryError(null);
        return true;
      } catch (error) {
        setDriveDeliveryError(extractErrorMessage(error));
        return false;
      }
    },
    [callbackGroupId, upsertCanonical],
  );

  const runDriveImports = useCallback(
    async (selections: StorageImportSelection[]) => {
      setDriveFailures([]);
      setDriveRetryError(null);
      const remainingFailures: StorageImportFailure[] = [];
      for (const selection of selections) {
        if (driveCancelRequestedRef.current) break;
        const result = await importStorageSourceFiles({
          provider: "google_drive",
          connectionId: connection?.id ?? "",
          selections: [selection],
          destinationFolderPath: importDestinationFolderPath ?? undefined,
          shouldContinue: () => !driveCancelRequestedRef.current,
        });
        remainingFailures.push(...result.failures);
        await deliverDriveImports(result.files);
      }
      setDriveFailures(remainingFailures);
      setDriveCollisionNames((current) => {
        const next = { ...current };
        for (const failure of remainingFailures) {
          if (failure.collisionProposal && !next[failure.selection.sourceRef]) {
            next[failure.selection.sourceRef] = failure.collisionProposal;
          }
        }
        return next;
      });
      if (
        driveRetainedRef.current.size === 0 &&
        (driveCancelRequestedRef.current || remainingFailures.length === 0)
      ) {
        await finishDriveImport();
      }
    },
    [
      connection?.id,
      deliverDriveImports,
      finishDriveImport,
      importDestinationFolderPath,
    ],
  );

  const retryDriveFailures = () => {
    const invalidCollision = driveFailures.some((failure) => {
      if (!failure.collisionProposal) return false;
      const confirmed = driveCollisionNames[failure.selection.sourceRef] ?? "";
      return (
        !safeStorageBasename(confirmed) ||
        !matchStorageAccept(
          confirmed,
          failure.selection.mimeType,
          accept ?? undefined,
        ).accepted
      );
    });
    if (invalidCollision) {
      setDriveRetryError(
        "Enter a valid file name for each collision before retrying.",
      );
      return;
    }
    void run("pick", () => {
      driveCancelRequestedRef.current = false;
      return runDriveImports(
        driveFailures.map((failure) => ({
          ...failure.selection,
          ...(failure.collisionProposal
            ? {
                destinationName:
                  driveCollisionNames[failure.selection.sourceRef],
              }
            : {}),
        })),
      );
    });
  };

  const retryDriveDelivery = () =>
    void deliverDriveImports([...driveRetainedRef.current.values()]).then(
      (acknowledged) => {
        if (acknowledged && driveRetainedRef.current.size === 0) {
          return finishDriveImport();
        }
      },
    );

  const requestClose = useCallback(() => {
    driveCancelRequestedRef.current = true;
    if (busy === "pick" || driveRetainedRef.current.size > 0) return;
    void finishDriveImport();
  }, [busy, finishDriveImport]);

  useEffect(() => {
    registerCloseRequest?.(requestClose);
    return () => registerCloseRequest?.(null);
  }, [registerCloseRequest, requestClose]);

  const connect = () =>
    void run("connect", async () => {
      const code = await googleAuth.openAuthorizationWindow([
        ...GOOGLE_WORKSPACE_FILE_SCOPES,
      ]);
      const result = await connectGoogle.mutateAsync({
        code,
        owner: { type: "user" },
      });
      selectConnection(result.connectionId);
      await inventory.refetch();
      toast.success("Google connected.");
    });

  const connectInThisTab = () =>
    void run("connect-redirect", async () => {
      // 🚨 A PRESS WAITS FOR THE ANSWER, IT NEVER REFUSES ON A RACE
      // (VERIFY-R7-FIX-WAVE NEW-1). Reading the selected organization once here
      // refused a person who HAS one, with a sentence about not having one, for
      // as long as boot took to answer. The bounded platform wait answers both
      // states, and its own reason carries the remedy.
      // 🚨 THE GATE IS TAKEN BEFORE THE WAIT, NOT AFTER IT (V-23 NEW-3).
      // The organization wait above is a multi-second gap on a cold load; a
      // second press inside it used to open a SECOND Google window for one
      // intent. Held here, released only if we never get to leave the page —
      // on success the redirect takes the page and the gate with it.
      const gate = googleAuth.beginAuthorization();
      try {
        const workspace = await awaitEffectiveOrganizationId();
        if (workspace.status !== "ready") {
          throw new Error(workspace.reason);
        }
        await googleAuth.openAuthorizationRedirect(
          [...GOOGLE_WORKSPACE_FILE_SCOPES],
          {
            returnTo: `${window.location.pathname}${window.location.search}${window.location.hash}`,
            owner: { type: "user" },
            organizationContextId: workspace.organizationId,
          },
          gate,
        );
      } catch (cause) {
        gate.release();
        throw cause;
      }
    });

  const enableSending = () =>
    void run("send", async () => {
      const code = await googleAuth.openAuthorizationWindow(
        [...GOOGLE_WORKSPACE_SEND_SCOPES],
        connection?.account_email ?? undefined,
      );
      const result = await connectGoogle.mutateAsync({
        code,
        owner: { type: "user" },
      });
      selectConnection(result.connectionId);
      rememberGoogleConnection("gmail-send", result.connectionId);
      await inventory.refetch();
      toast.success("Email sending enabled.");
    });

  const chooseFile = () =>
    void run("pick", async () => {
      if (!connection) return;
      if (mode === "drive-import") driveCancelRequestedRef.current = false;
      const accessToken = await getGoogleDrivePickerToken(connection);
      if (mode === "drive-import") {
        const picked = await pickGoogleDriveFiles(accessToken, { multiple });
        if (driveCancelRequestedRef.current) {
          await finishDriveImport();
          return;
        }
        if (!picked?.length) return;
        const selection = enforceStorageSelectionMode(picked, multiple);
        if (!selection.accepted) throw new Error(selection.reason);
        const rejected = selection.values.find(
          (file) =>
            !matchStorageAccept(file.name, file.mimeType, accept ?? undefined)
              .accepted,
        );
        if (rejected) {
          throw new Error(
            matchStorageAccept(
              rejected.name,
              rejected.mimeType,
              accept ?? undefined,
            ).reason ?? `${rejected.name} cannot be selected here.`,
          );
        }
        await runDriveImports(
          selection.values.map((file) => ({
            sourceRef: file.id,
            name: file.name,
            mimeType: file.mimeType,
          })),
        );
        return;
      }
      const picked = await pickGoogleWorkspaceFile(accessToken);
      if (!picked) return;
      const registered = await registerSelectedGoogleFile(
        connection.id,
        picked.id,
      );
      setFreshRecords((prev) => ({
        ...prev,
        [registered.id]: {
          record_id: registered.recordId,
          record_sync_status: registered.recordSyncStatus,
          record_sync_status_reason: registered.recordSyncStatusReason,
          record_absent_reason: registered.recordAbsentReason,
        },
      }));
      await inventory.refetch();
      onFilesPicked?.([registered]);
      const recordRef = {
        type: registered.resourceType,
        id: registered.id,
        title: registered.name,
      };
      // 🚨 F-77 (V-21 N1) — a Record that could not be written is never called
      // "ready to use": the file is still picked and usable (its Google link
      // stays), but the door to a Record that does not exist is not offered,
      // and the server's own sentence — never a paraphrase — says why.
      //
      // F-83 (Bugbot LOW on 80c8027b): a Slides deck (or any file type with no
      // Record table) having no Record is an EXPECTED outcome of a pick, not
      // a fault — this is `recordToast.info`, never `toast.warning`, so it
      // (a) never feeds the Error Inspector (only `error`/`warning` do, per
      // lib/toast.ts's own doc comment) and (b) carries the SAME picked-file
      // identity the success toast below uses, so it is dismissed the instant
      // this file leaves the screen instead of possibly outliving it.
      if (!registered.recordId) {
        recordToast.info(
          recordRef,
          `${registered.name} is picked and usable, but its record could not be created.`,
          {
            description:
              registered.recordAbsentReason ??
              "AI Matrx did not say why. Try picking it again; if it keeps happening, tell us.",
          },
        );
        return;
      }
      recordToast.success(recordRef, `${registered.name} is ready to use.`);
      if (
        registered.recordSyncStatus &&
        registered.recordSyncStatus !== "available" &&
        registered.recordSyncStatusReason
      ) {
        // Same identity, same reasoning as above: an unhealthy sync status is
        // information about this file, not an error, and follows the file.
        recordToast.info(recordRef, registered.recordSyncStatusReason);
      }
    });

  return (
    <NonEditableContextMenu
      sourceFeature="files"
      contentSource={{ type: "raw" }}
      contextData={{ content: "" }}
      resolveContextOnOpen={(target) => {
        const el = target?.closest<HTMLElement>("[data-row-id]");
        const id = el?.getAttribute("data-row-id") ?? null;
        setClickedFileId(id);
        const file = id ? (files.find((f) => f.id === id) ?? null) : null;
        return { content: file?.display_name ?? "" };
      }}
      extraSections={(() => {
        const file = files.find((f) => f.id === clickedFileId) ?? null;
        const link =
          typeof file?.metadata?.web_view_link === "string"
            ? file.metadata.web_view_link
            : null;
        if (!file) return [];
        return [
          {
            id: "google-file",
            label: file.display_name,
            items: [
              {
                kind: "link" as const,
                id: "google-file-open",
                label: "Open in Google",
                icon: ExternalLink,
                href: link ?? "#",
                disabled: !link,
              },
            ],
          },
        ];
      })()}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {inventory.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your Google account…
          </div>
        ) : !connection ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-foreground">
              {reason
                ? `Connect Google ${reason}.`
                : mode === "drive-import"
                  ? "Connect Google to import the Drive files you choose."
                  : "Connect Google and AI Matrx can work with the docs and sheets you choose."}{" "}
              <span className="text-muted-foreground">
                Nothing else in your Drive.
              </span>
            </p>
            <Button
              size="sm"
              onClick={connect}
              disabled={authorizationActionDisabled}
            >
              {busy === "connect"
                ? "Connecting…"
                : !google.isGoogleLoaded
                  ? "Loading Google…"
                  : "Connect Google"}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={connectInThisTab}
              disabled={authorizationActionDisabled}
            >
              {busy === "connect-redirect"
                ? "Opening Google…"
                : "Continue with Google in this tab"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <GoogleAccountSelect
              connections={connections}
              connectionId={connection.id}
              onConnectionChange={selectConnection}
              disabled={busy !== null}
            />

            <Button
              size="sm"
              variant="ghost"
              onClick={connect}
              disabled={authorizationActionDisabled}
              className="self-start"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {busy === "connect" ? "Connecting…" : "Add another account"}
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={connectInThisTab}
              disabled={authorizationActionDisabled}
              className="self-start"
            >
              {busy === "connect-redirect"
                ? "Opening Google…"
                : "Reconnect in this tab"}
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={chooseFile}
              disabled={
                busy === "pick" ||
                (mode === "drive-import" &&
                  (driveRetained.size > 0 || driveFailures.length > 0))
              }
            >
              {busy === "pick"
                ? mode === "drive-import"
                  ? "Importing from Google…"
                  : "Opening Google…"
                : mode === "drive-import"
                  ? "Choose files to import"
                  : googleWorkspacePickLabel()}
            </Button>

            {mode === "drive-import" && driveFailures.length ? (
              <div className="rounded-md border border-warning/30 bg-warning/5 p-2.5 text-xs">
                <p className="font-medium">Some files still need attention</p>
                {driveFailures.map((failure) => (
                  <div key={failure.selection.sourceRef} className="mt-1">
                    <p>
                      {failure.selection.name}: {failure.error}
                    </p>
                    {failure.collisionProposal ? (
                      <Input
                        className="mt-1 h-9"
                        aria-label={`New name for ${failure.selection.name}`}
                        value={
                          driveCollisionNames[failure.selection.sourceRef] ??
                          failure.collisionProposal
                        }
                        onChange={(event) =>
                          setDriveCollisionNames((current) => ({
                            ...current,
                            [failure.selection.sourceRef]: event.target.value,
                          }))
                        }
                      />
                    ) : null}
                  </div>
                ))}
                {driveRetryError ? (
                  <p className="mt-1 text-destructive">{driveRetryError}</p>
                ) : null}
                <Button
                  size="sm"
                  className="mt-2"
                  disabled={busy === "pick"}
                  onClick={retryDriveFailures}
                >
                  Retry failed imports
                </Button>
              </div>
            ) : null}

            {mode === "drive-import" && driveRetained.size > 0 ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2.5 text-xs">
                <p>
                  {driveDeliveryError ??
                    `${driveRetained.size} imported file${driveRetained.size === 1 ? " is" : "s are"} waiting to be attached.`}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={retryDriveDelivery}>
                    Retry attaching
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void finishDriveImport()}
                  >
                    Keep in Files and close
                  </Button>
                </div>
              </div>
            ) : null}

            {mode === "workspace" &&
            files.some((file) =>
              hasGoogleDocumentRecord(file.resource_type),
            ) ? (
              <p className="text-xs text-muted-foreground">
                {OPEN_GOOGLE_RECORD_CONSEQUENCE}
              </p>
            ) : null}

            {mode === "workspace" && files.length ? (
              <div className="overflow-hidden rounded-md border border-border">
                {files.map((file) => {
                  const fileType = googleWorkspaceFileType(file.resource_type);
                  const link =
                    typeof file.metadata?.web_view_link === "string" &&
                    file.metadata.web_view_link
                      ? file.metadata.web_view_link
                      : fileType.hrefFor(file.resource_ref);
                  const Icon = fileType.icon;
                  // 🚨 F-77 (V-21 N1) — a fresh pick that could not write a
                  // Record is never offered the door to one that does not
                  // exist; the plain sentence the server composed is shown
                  // instead, and the sync reason rides beside a Record that
                  // was kept but is not in the healthy state.
                  const fresh = freshRecords[file.id];
                  const recordAbsent = fresh ? fresh.record_id === null : false;
                  const showRecordDoor =
                    hasGoogleDocumentRecord(file.resource_type) &&
                    !recordAbsent;
                  const syncReason =
                    fresh?.record_id &&
                    fresh.record_sync_status &&
                    fresh.record_sync_status !== "available"
                      ? fresh.record_sync_status_reason
                      : null;
                  return (
                    <div
                      key={file.id}
                      data-row-id={file.id}
                      className="border-b border-border/60 last:border-b-0"
                    >
                      <div className="flex items-center gap-2 px-2.5 py-1.5">
                        <Icon
                          className={`h-4 w-4 shrink-0 ${fileType.iconClassName}`}
                        />
                        <span className="truncate text-sm text-foreground">
                          {file.display_name}
                        </span>
                        {/*
                          🚨 THE RECORD IS THE DOOR (F-58). A picked file listed
                          with nothing but its Google link is a named identity with
                          no AI Matrx surface; this opens it as its Record in the
                          Detail primitive, in place.
                        */}
                        {showRecordDoor ? (
                          <OpenGoogleDocumentRecordButton
                            resource={pickedGoogleRecordResource({
                              ...file,
                              ...freshRecords[file.id],
                            })}
                            variant="ghost"
                            className="ml-auto shrink-0"
                          />
                        ) : null}
                        {typeof link === "string" && link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`${showRecordDoor ? "" : "ml-auto "}shrink-0 text-muted-foreground hover:text-foreground`}
                            aria-label={`Open ${file.display_name} in Google`}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                      {recordAbsent && fresh?.record_absent_reason ? (
                        <p className="flex items-start gap-1.5 px-2.5 pb-1.5 text-xs text-muted-foreground">
                          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                          <span className="min-w-0 flex-1">
                            {file.display_name} is picked and usable, but its
                            record could not be created:{" "}
                            {fresh.record_absent_reason}
                          </span>
                        </p>
                      ) : null}
                      {syncReason ? (
                        <p className="flex items-start gap-1.5 px-2.5 pb-1.5 text-xs text-muted-foreground">
                          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                          <span className="min-w-0 flex-1">{syncReason}</span>
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : mode === "workspace" ? (
              <p className="text-xs text-muted-foreground">
                No files chosen yet. Pick one and it stays available to you and
                your agents.
              </p>
            ) : null}

            {mode === "workspace" && !canSend ? (
              <div className="flex flex-col gap-1.5 rounded-md border border-border bg-muted/30 p-2.5">
                <div className="flex items-center gap-1.5 text-sm text-foreground">
                  <Mail className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                  Send email too?
                </div>
                <p className="text-xs text-muted-foreground">
                  An agent can draft a message; you review every one and send it
                  yourself.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={enableSending}
                  disabled={authorizationActionDisabled}
                >
                  {busy === "send" ? "Enabling…" : "Enable email sending"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </NonEditableContextMenu>
  );
}
