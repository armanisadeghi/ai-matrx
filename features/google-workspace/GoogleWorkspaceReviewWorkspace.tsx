"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  FileText,
  Loader2,
  LockKeyhole,
  Mail,
  Plus,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { recordToast, toast } from "@/lib/toast";
import { sheetTextToValues, sheetValuesToText } from "@/features/google-workspace/sheetText";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable, type MatrxColumnDef, type MatrxDataTableCopyConfig } from "@ai-matrx/design-system/data-table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useConnectGoogle,
  useDisconnectGoogle,
  useGoogleConnectionInventory,
} from "@/features/marketing/google/hooks";
import type {
  GoogleConnectionResource,
  GoogleConnectionSummary,
} from "@/features/marketing/google/types";
import { isGoogleWorkspaceFileRow } from "@/features/marketing/google/types";
import {
  googleWorkspaceFileType,
  googleWorkspacePickLabel,
  googleWorkspacePickScopeSentence,
  type GoogleWorkspaceResourceType,
} from "@/features/google-workspace/resource-types";
import {
  DEFAULT_GOOGLE_SHEET_RANGE,
  SENT_FOR_APPROVAL_MESSAGE,
  approvalQueueHref,
  isGoogleWorkspaceInputError,
  readGoogleSheet,
  registerSelectedGoogleFile,
  sendReviewedGmail,
  writeGoogleSheet,
} from "@/features/google-workspace/service";
import { reviewedSendNotices } from "@/features/crm/gmail/reviewed-send-contract";
import {
  GOOGLE_SCOPE,
  GOOGLE_WORKSPACE_FILE_SCOPES,
  GOOGLE_WORKSPACE_SEND_SCOPES,
  hasGoogleGrantedScope,
} from "@/lib/googleScopes";
import { pickGoogleWorkspaceFile } from "@/lib/googlePicker";
import {
  isGoogleAuthorizationCancelled,
  useGoogleAPI,
} from "@/providers/google-provider/GoogleApiProvider";
import {
  preferredGoogleConnectionId,
  rememberGoogleConnection,
} from "@/features/google-workspace/connection";
import { ProTextarea } from "@/components/official/ProTextarea";
import { ReadFailure } from "@ai-matrx/design-system";
import { getGoogleDrivePickerToken } from "@/features/google-workspace/drivePickerToken";
import {
  OPEN_GOOGLE_RECORD_CONSEQUENCE,
  OpenGoogleDocumentRecordButton,
  hasGoogleDocumentRecord,
  pickedGoogleRecordResource,
} from "@/features/google-workspace/documents/openRecord";
import { useGoogleAuthorizationWindow } from "@/providers/google-provider/useGoogleAuthorizationWindow";
import { useAppDispatch } from "@/lib/redux/hooks";
import { readGooglePresentation } from "@/features/connected-sources/api";
import {
  ReadResultsDialog,
  type ConnectedReadDialogState,
} from "@/features/connected-sources/components/ReadResultsDialog";

type BusyAction =
  | "connect-files"
  | "enable-gmail"
  | "pick-file"
  | "read-file"
  | "write-file"
  | "send-email"
  | "disconnect"
  | null;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The request failed.";
}

function hasScope(connection: GoogleConnectionSummary, scope: string): boolean {
  return hasGoogleGrantedScope(connection.scopes, scope);
}

/**
 * THE PREDICATE IS SHARED (`isGoogleWorkspaceFileRow`). It used to be a local
 * hand-typed pair here, which is how a Slides deck the server had already
 * registered was filtered out of this list — a connected, named file with no
 * row and no door (V13-3).
 */
/** The door at Google: the row's own stored link, or the type's canonical URL. */
function resourceDoor(
  resource: GoogleConnectionResource & {
    resource_type: GoogleWorkspaceResourceType;
  },
): string {
  return (
    metadataLink(resource) ??
    googleWorkspaceFileType(resource.resource_type).hrefFor(
      resource.resource_ref,
    )
  );
}

function metadataLink(resource: GoogleConnectionResource): string | null {
  const value = resource.metadata.web_view_link;
  return typeof value === "string" && value ? value : null;
}

function isPresentationResource(
  resource:
    | (GoogleConnectionResource & {
        resource_type: GoogleWorkspaceResourceType;
      })
    | null,
): resource is GoogleConnectionResource & {
  resource_type: "google_presentation";
} {
  return resource?.resource_type === "google_presentation";
}

function connectionName(connection: GoogleConnectionSummary): string {
  return (
    connection.account_email ?? connection.account_name ?? "Google account"
  );
}

function connectionStatus(connection: GoogleConnectionSummary): string {
  if (connection.health === "needs_reauth") return "Needs attention";
  if (connection.health === "revoked") return "Disconnected";
  return "Connected";
}

const ACCOUNT_COPY: MatrxDataTableCopyConfig<GoogleConnectionSummary> = {
  label: "Google account",
  listLabel: "Connected Google accounts (this view)",
  location: "Google Workspace — connected accounts",
  rowKind: "google-account-connection",
  listKind: "google-account-connections",
  rowDescription: "One connected Google account and what it has granted.",
  listDescription: "The Google accounts connected by this person, as currently shown.",
  humanRow: (connection) =>
    [
      `Account: ${connectionName(connection)}`,
      `Docs & Sheets: ${hasScope(connection, GOOGLE_SCOPE.driveFile) ? "Granted" : "Not granted"}`,
      `Gmail sending: ${hasScope(connection, GOOGLE_SCOPE.gmailSend) ? "Granted" : "Not granted"}`,
      `Connection: ${connectionStatus(connection)}`,
    ].join("\n"),
};

interface GoogleWorkspaceReviewWorkspaceProps {
  pickerInitialQuery?: string;
}


export function GoogleWorkspaceReviewWorkspace({
  pickerInitialQuery,
}: GoogleWorkspaceReviewWorkspaceProps) {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const google = useGoogleAPI();
  // 🚨 ONE Google authorization window per PERSON — never a per-component
  // lock, never the raw provider primitive (V-23 NEW-3, lane F-103).
  const googleAuth = useGoogleAuthorizationWindow();
  const inventory = useGoogleConnectionInventory();
  const connectGoogle = useConnectGoogle();
  const disconnectGoogle = useDisconnectGoogle();
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(
    () => preferredGoogleConnectionId("workspace"),
  );
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetRange, setSheetRange] = useState(DEFAULT_GOOGLE_SHEET_RANGE);
  const [sheetValues, setSheetValues] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);
  const [pickerSessionConnectionId, setPickerSessionConnectionId] = useState<
    string | null
  >(null);
  const [slideReadDialog, setSlideReadDialog] = useState<{
    key: string;
    request: number;
    state: ConnectedReadDialogState;
  } | null>(null);
  const slideReadRequest = useRef(0);
  /**
   * 🚨 F-74 — a fresh pick hands its Record straight to the open control (F-69,
   * `openRecord.tsx`). `selectedResources` renders from the inventory read
   * (`users.integration_connection_resources`), which has never carried
   * `record_id` — that field lives only on the registration response
   * (`SelectedGoogleFile.recordId`, aidream F-57/R29) — so without this every
   * file on this bench, including one picked seconds ago, takes the slower
   * read-then-refresh leg `useOpenGoogleDocumentRecord` falls back to. Keyed by
   * the picked-resource id, which is stable across the `inventory.refetch()`
   * that follows registration.
   *
   * 🚨 F-77 (V-21 N1) — THE SERVER'S TWO REASONS RIDE ALONG TOO. See the same
   * note in `GoogleWorkspaceConnectBody.tsx`: a registration that could not
   * write the Record answers `record_id: null` plus a plain
   * `record_absent_reason` sentence; one that could still answers an optional
   * `record_sync_status_reason` when the kept status is not the healthy one.
   * Both used to be parsed and thrown away here.
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

  const personalConnections = useMemo(
    () =>
      (inventory.data?.connections ?? []).filter(
        (connection) =>
          connection.owner_type === "user" && connection.status !== "revoked",
      ),
    [inventory.data?.connections],
  );
  const preferredConnection =
    personalConnections.find((connection) =>
      hasScope(connection, GOOGLE_SCOPE.driveFile),
    ) ??
    personalConnections[0] ??
    null;
  const effectiveConnectionId = personalConnections.some(
    (connection) => connection.id === activeConnectionId,
  )
    ? activeConnectionId
    : (preferredConnection?.id ?? null);
  const activeConnection =
    personalConnections.find(
      (connection) => connection.id === effectiveConnectionId,
    ) ?? null;

  const selectWorkspaceConnection = (connectionId: string) => {
    setActiveConnectionId(connectionId);
    rememberGoogleConnection("workspace", connectionId);
  };
  const selectedResources = useMemo(
    () =>
      (inventory.data?.resources ?? [])
        .filter((resource) => resource.connection_id === effectiveConnectionId)
        .filter(isGoogleWorkspaceFileRow),
    [effectiveConnectionId, inventory.data?.resources],
  );
  const selectedResource = useMemo(
    () =>
      selectedResources.find(
        (resource) => resource.id === selectedResourceId,
      ) ??
      selectedResources[0] ??
      null,
    [selectedResourceId, selectedResources],
  );
  const selectedPresentation = isPresentationResource(selectedResource)
    ? selectedResource
    : null;
  const selectedPresentationKey =
    activeConnection && selectedPresentation
      ? `${activeConnection.id}:${selectedPresentation.id}:${selectedPresentation.resource_ref}`
      : null;

  // Changing the effective account/file or unmounting invalidates the request.
  // Its callbacks then become no-ops, so a late response cannot replace the
  // newly selected file, reopen a closed dialog, or clear newer pending state.
  useEffect(
    () => () => {
      slideReadRequest.current += 1;
    },
    [selectedPresentationKey],
  );

  const run = async (action: BusyAction, operation: () => Promise<void>) => {
    setBusy(action);
    setError(null);
    try {
      await operation();
    } catch (operationError: unknown) {
      if (isGoogleAuthorizationCancelled(operationError)) {
        toast.info("Google authorization cancelled");
        return;
      }
      const message = errorMessage(operationError);
      setError(message);
      if (!isGoogleWorkspaceInputError(operationError)) {
        toast.error(message);
      }
    } finally {
      setBusy(null);
    }
  };

  const connectFiles = () =>
    run("connect-files", async () => {
      const code = await googleAuth.openAuthorizationWindow([
        ...GOOGLE_WORKSPACE_FILE_SCOPES,
      ]);
      const result = await connectGoogle.mutateAsync({
        code,
        owner: { type: "user" },
      });
      selectWorkspaceConnection(result.connectionId);
      toast.success("Google Docs & Sheets access connected.");
    });

  const enableGmail = () => {
    if (!activeConnection) return;
    void run("enable-gmail", async () => {
      const code = await googleAuth.openAuthorizationWindow(
        [...GOOGLE_WORKSPACE_SEND_SCOPES],
        activeConnection.account_email ?? undefined,
      );
      const result = await connectGoogle.mutateAsync({
        code,
        owner: { type: "user" },
      });
      selectWorkspaceConnection(result.connectionId);
      rememberGoogleConnection("gmail-send", result.connectionId);
      toast.success("Reviewed Gmail sending is enabled.");
    });
  };

  const chooseFile = () => {
    if (!activeConnection) return;
    void run("pick-file", async () => {
      const accessToken = await getGoogleDrivePickerToken(activeConnection);
      setPickerSessionConnectionId(activeConnection.id);
      const picked = await pickGoogleWorkspaceFile(accessToken, {
        initialQuery: pickerInitialQuery,
      });
      if (!picked) return;
      const registered = await registerSelectedGoogleFile(
        activeConnection.id,
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
      setSelectedResourceId(registered.id);
      const recordRef = {
        type: "google_workspace_resource",
        id: registered.id,
        title: registered.name,
      };
      // 🚨 F-77 (V-21 N1) — a Record that could not be written is never called
      // "ready": the file is still picked and usable (its Google link stays),
      // but the door to a Record that does not exist is not offered, and the
      // server's own sentence — never a paraphrase — says why.
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
      recordToast.success(recordRef, `${registered.name} is ready.`);
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
  };

  /**
   * The Sheets range read — the ONLY read left on this bench. A Doc is not read
   * here at all any more: it opens as its Record in the Detail primitive, which
   * owns the body, the refresh and the append (F-58).
   *
   * The reader is still gated on the ONE file-type record rather than assuming
   * "not a Doc means a Sheet": that fall-through is what the old
   * `if (Doc) … else sheet` did to a Slides deck — it asked the Sheets API for a
   * presentation id and showed Google's error as if the deck were broken.
   */
  const readSelectedRange = () => {
    if (!activeConnection || !selectedResource) return;
    const fileType = googleWorkspaceFileType(selectedResource.resource_type);
    if (fileType.clientRead !== "sheet") {
      toast.info(`${fileType.label}s are not read on this screen.`, {
        description: fileType.readOnlyNote ?? undefined,
      });
      return;
    }
    void run("read-file", async () => {
      const result = await readGoogleSheet(
        activeConnection.id,
        selectedResource.resource_ref,
        sheetRange.trim(),
      );
      setSheetValues(sheetValuesToText(result.values));
      toast.success(`Loaded ${result.range}.`);
    });
  };

  const readSelectedPresentation = () => {
    if (
      !activeConnection ||
      !selectedResource ||
      selectedResource.resource_type !== "google_presentation"
    ) {
      return;
    }
    // Capture the effective selection, including the first-row fallback when
    // `selectedResourceId` is still null. The registered row's id and ref are
    // the authority for this one explicit read.
    const connectionId = activeConnection.id;
    const resourceId = selectedResource.id;
    const resourceRef = selectedResource.resource_ref;
    const title = selectedResource.display_name;
    const key = `${connectionId}:${resourceId}:${resourceRef}`;
    const request = ++slideReadRequest.current;
    setError(null);
    setSlideReadDialog({
      key,
      request,
      state: { kind: "slides", pending: true, titles: [title] },
    });

    void readGooglePresentation(dispatch, connectionId, resourceRef)
      .then((deck) => {
        if (slideReadRequest.current !== request) return;
        setSlideReadDialog({
          key,
          request,
          state: {
            kind: "slides",
            files: [{ title, url: resourceDoor(selectedResource), deck }],
          },
        });
      })
      .catch((operationError: unknown) => {
        if (slideReadRequest.current !== request) return;
        const message = errorMessage(operationError);
        setSlideReadDialog(null);
        setError(message);
        toast.error(message);
      });
  };

  const closeSlideRead = () => {
    slideReadRequest.current += 1;
    setSlideReadDialog(null);
  };

  /**
   * 🚨 THE WRITE MAY HAVE BECOME A PROPOSAL. When the organization's autonomy
   * mode for this capability requires review, the server writes NOTHING and
   * answers 202 having filed the change in the ONE approval queue
   * (`hitl.google.attended_file_write`; round-2 verification § A-vii — the knob
   * governed the agent path only and a person's own click ignored it). Saying
   * "appended" or "updated" over that would be the screen claiming a change that
   * has not happened, so it says what did happen and opens the queue row.
   */
  const sentForApproval = (assistId: string) => {
    toast.info(SENT_FOR_APPROVAL_MESSAGE, {
      description:
        "Your organization asks a person to review this kind of change before it is written. Nothing in Google has changed yet.",
      action: {
        label: "Open the approval",
        onClick: () => router.push(approvalQueueHref(assistId)),
      },
    });
  };

  /**
   * The Sheets range write. THE DOC APPEND IS NOT HERE — the composer that
   * writes to a Doc lives once, in the Record's Detail panel, where the exact
   * block is shown before anything reaches Google and the dated heading comes
   * from `google.docs.append_heading`. A second append path on this bench sent
   * different bytes to a customer's document (VERIFY-U-W1-U-W2 N2).
   */
  const writeSelectedRange = () => {
    if (!activeConnection || !selectedResource) return;
    const fileType = googleWorkspaceFileType(selectedResource.resource_type);
    if (fileType.clientRead !== "sheet" || !fileType.writable) {
      toast.info(
        `AI Matrx does not write to ${fileType.label}s on this screen.`,
        {
          description: fileType.readOnlyNote ?? undefined,
        },
      );
      return;
    }
    void run("write-file", async () => {
      const values = sheetTextToValues(sheetValues);
      const outcome = await writeGoogleSheet(
        activeConnection.id,
        selectedResource.resource_ref,
        sheetRange.trim(),
        values,
      );
      if (outcome.proposed) {
        sentForApproval(outcome.assistId);
        return;
      }
      setSheetValues(sheetValuesToText(outcome.result.values));
      toast.success(`Updated ${outcome.result.range}.`);
    });
  };

  const sendEmail = () => {
    if (!activeConnection || !emailConfirmed) return;
    void run("send-email", async () => {
      rememberGoogleConnection("gmail-send", activeConnection.id);
      const outcome = await sendReviewedGmail({
        connectionId: activeConnection.id,
        to: emailTo,
        cc: emailCc
          .split(",")
          .map((address) => address.trim())
          .filter(Boolean),
        subject: emailSubject,
        body: emailBody,
        // This bench is not a CRM record: it names no party, so the server files
        // no timeline row and says so in `record_failure` below. The organization
        // is the viewer's own context, resolved by the transport through the ONE
        // fail-closed kernel — this bench never picks one.
        context: { organizationId: null },
      });
      setEmailConfirmed(false);
      // The server says who it reached; this bench shows it, because "sent" with
      // no recipient is exactly the claim lane B-10 made checkable.
      const reached = outcome.to ?? emailTo;
      toast.success(`Gmail sent to ${reached} (message ${outcome.messageId}).`);
      // 🚨 AND EVERY GAP IT REPORTED, on the bench too: this surface exists to
      // show what the send path actually did, so a row that was not written or a
      // sending event that does not exist is shown, never swallowed.
      for (const notice of reviewedSendNotices(outcome)) {
        if (notice.level === "error") toast.error(notice.sentence);
        else toast.warning(notice.sentence);
      }
    });
  };

  const disconnect = () => {
    if (!activeConnection) return;
    void run("disconnect", async () => {
      const result = await disconnectGoogle.mutateAsync(activeConnection.id);
      if (pickerSessionConnectionId === activeConnection.id) {
        setPickerSessionConnectionId(null);
      }
      setActiveConnectionId(null);
      setSelectedResourceId(null);
      if (result.googleAuthorizationStatus === "active_for_other_connection") {
        toast.success(
          "Google connection removed from AI Matrx. Google authorization remains active for your other connection to this account.",
        );
      } else if (result.googleAuthorizationStatus === "revoked") {
        toast.success(
          "Google account disconnected and Google confirmed authorization revocation.",
        );
      } else {
        toast.warning(
          "Google connection removed from AI Matrx, but Google did not confirm authorization revocation. Review access in your Google Account.",
        );
      }
    });
  };

  const filesEnabled = Boolean(
    activeConnection && hasScope(activeConnection, GOOGLE_SCOPE.driveFile),
  );
  const gmailEnabled = Boolean(
    activeConnection && hasScope(activeConnection, GOOGLE_SCOPE.gmailSend),
  );

  type AccountRow = (typeof personalConnections)[number];
  const grantedCell = (granted: boolean) => (
    <span
      className={
        granted
          ? "text-emerald-700 dark:text-emerald-400"
          : "text-muted-foreground"
      }
    >
      {granted ? "Granted" : "Not granted"}
    </span>
  );
  const sessionText = (connection: AccountRow) =>
    google.isAuthenticated && pickerSessionConnectionId === connection.id
      ? "Signed in"
      : "Sign-in when needed";
  const accountColumns: MatrxColumnDef<AccountRow>[] = [
    {
      id: "account",
      header: "Account",
      accessorFn: connectionName,
      filter: "text",
      width: 260,
      frozen: true,
      cell: (connection) => (
        <button
          type="button"
          onClick={() => selectWorkspaceConnection(connection.id)}
          className="max-w-64 truncate text-left font-medium hover:text-primary hover:underline"
        >
          {connectionName(connection)}
        </button>
      ),
    },
    {
      id: "docs",
      header: "Docs & Sheets",
      accessorFn: (connection) =>
        hasScope(connection, GOOGLE_SCOPE.driveFile) ? "Granted" : "Not granted",
      filter: "select",
      filterOptions: [
        { value: "Granted", label: "Granted" },
        { value: "Not granted", label: "Not granted" },
      ],
      width: 140,
      cell: (connection) => grantedCell(hasScope(connection, GOOGLE_SCOPE.driveFile)),
    },
    {
      id: "gmail",
      header: "Gmail sending",
      accessorFn: (connection) =>
        hasScope(connection, GOOGLE_SCOPE.gmailSend) ? "Granted" : "Not granted",
      filter: "select",
      filterOptions: [
        { value: "Granted", label: "Granted" },
        { value: "Not granted", label: "Not granted" },
      ],
      width: 150,
      cell: (connection) => grantedCell(hasScope(connection, GOOGLE_SCOPE.gmailSend)),
    },
    {
      id: "connection",
      header: "Connection",
      accessorFn: connectionStatus,
      filter: "select",
      filterOptions: [
        { value: "Connected", label: "Connected" },
        { value: "Needs attention", label: "Needs attention" },
        { value: "Disconnected", label: "Disconnected" },
      ],
      width: 160,
      cell: (connection) => (
        <span className="inline-flex items-center gap-1.5">
          {connection.health === "connected" ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
          ) : (
            <CircleAlert className="h-3.5 w-3.5 text-amber-600" />
          )}
          {connectionStatus(connection)}
        </span>
      ),
    },
    {
      id: "session",
      header: "Google session",
      accessorFn: sessionText,
      filter: "text",
      width: 170,
      cell: (connection) => (
        <span className="text-muted-foreground">{sessionText(connection)}</span>
      ),
    },
    {
      id: "manage",
      header: "Manage",
      accessorFn: (connection) =>
        connection.id === effectiveConnectionId ? "Selected" : "",
      sortable: false,
      width: 110,
      align: "right",
      cell: (connection) => (
        <Button
          type="button"
          variant={connection.id === effectiveConnectionId ? "outline" : "quiet"}
          onClick={() => selectWorkspaceConnection(connection.id)}
        >
          {connection.id === effectiveConnectionId ? "Selected" : "Manage"}
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 p-3 sm:p-4">
      <header>
        <h1 title="Manage connected accounts and the Google access each one has." className="text-2xl font-semibold tracking-tight">
          Google Workspace
        </h1>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Action could not be completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 p-4 pb-2">
          <div>
            <CardTitle className="text-base">Connected accounts</CardTitle>
            <CardDescription>Select an account to manage it.</CardDescription>
          </div>
          <Button
            icon={busy === "connect-files" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Plus />
            )}
            variant="primary"
            type="button"
            onClick={() => void connectFiles()}
            disabled={!google.isGoogleLoaded || busy !== null}
          >
            Add account
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {inventory.isLoading ? (
            <div className="px-4 py-6 text-center">
              <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : inventory.isError && personalConnections.length === 0 ? (
            <ReadFailure
              error={inventory.error}
              what="your Google accounts"
              onRetry={() => void inventory.refetch()}
            />
          ) : (
            <MatrxDataTable<(typeof personalConnections)[number]>
              tableId="google-workspace/connected-accounts"
              data={personalConnections}
              columns={accountColumns}
              getRowId={(connection) => connection.id}
              pageSize={0}
              density="condensed"
              viewTabs={false}
              toolbar={{ searchPlaceholder: "Search accounts" }}
              detail={{ enabled: false }}
              copy={ACCOUNT_COPY}
              searchText={(connection) => connectionName(connection)}
              rowClassName={(connection) =>
                connection.id === effectiveConnectionId ? "bg-primary/5" : undefined
              }
              emptyState={{ title: "No Google accounts connected" }}
            />
          )}
        </CardContent>
      </Card>

      {activeConnection && (
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">
              Manage {connectionName(activeConnection)}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 p-4 pt-0">
            <Button
              icon={busy === "connect-files" && <Loader2 className="animate-spin" />}
              type="button"
              variant="outline"
              onClick={() => void connectFiles()}
              disabled={!google.isGoogleLoaded || busy !== null}
            >
              {filesEnabled
                ? "Refresh Docs & Sheets access"
                : "Add Docs & Sheets access"}
            </Button>
            {!gmailEnabled && (
              <Button
                icon={busy === "enable-gmail" && (
                  <Loader2 className="animate-spin" />
                )}
                type="button"
                variant="outline"
                onClick={enableGmail}
                disabled={!google.isGoogleLoaded || busy !== null}
              >
                Add Gmail sending
              </Button>
            )}
            <Button
              icon={busy === "disconnect" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Unplug />
              )}
              type="button"
              variant="outline"
              onClick={disconnect}
              disabled={busy !== null}
            >
              Disconnect
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p>
          Google content is used only for actions you request; it is not sold or
          used to train generalized AI models.{" "}
          <Link
            href="/privacy-policy"
            target="_blank"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Privacy policy
            <ExternalLink className="ml-1 inline h-3 w-3" />
          </Link>
        </p>
      </div>

      {filesEnabled && activeConnection && (
        <Collapsible>
          <Card>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="group flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span>
                  <span className="flex items-center gap-2 font-medium">
                    <FileText className="h-4 w-4 text-primary" />
                    Test the file connection
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Choose a file, then try a read or update.
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 border-t p-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">
                    {googleWorkspacePickScopeSentence()}
                  </p>
                  <Button
                    icon={busy === "pick-file" && (
                      <Loader2 className="animate-spin" />
                    )}
                    type="button"
                    variant="outline"
                    onClick={chooseFile}
                    disabled={busy !== null}
                  >
                    {googleWorkspacePickLabel()}
                  </Button>
                </div>
                {inventory.isError && selectedResources.length === 0 ? (
                  <ReadFailure
                    error={inventory.error}
                    what="the files you picked for this account"
                    onRetry={() => void inventory.refetch()}
                    className="m-0"
                  />
                ) : selectedResources.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No selected files for this account.
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {OPEN_GOOGLE_RECORD_CONSEQUENCE}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {selectedResources.map((resource) => {
                        const fileType = googleWorkspaceFileType(
                          resource.resource_type,
                        );
                        const FileIcon = fileType.icon;
                        // Never conditional: a named file always opens. The row
                        // used to hide this link whenever the stored
                        // `web_view_link` was absent, which is a dead end on a
                        // record we can address by id.
                        const link = resourceDoor(resource);
                        const selected = resource.id === selectedResourceId;
                        // 🚨 F-77 (V-21 N1) — a fresh pick that could not
                        // write a Record is never offered the door to one
                        // that does not exist; the plain sentence the server
                        // composed is shown instead, and the sync reason
                        // rides beside a Record that was kept but is not in
                        // the healthy state.
                        const fresh = freshRecords[resource.id];
                        const recordAbsent = fresh
                          ? fresh.record_id === null
                          : false;
                        const showRecordDoor =
                          hasGoogleDocumentRecord(resource.resource_type) &&
                          !recordAbsent;
                        const syncReason =
                          fresh?.record_id &&
                          fresh.record_sync_status &&
                          fresh.record_sync_status !== "available"
                            ? fresh.record_sync_status_reason
                            : null;
                        return (
                          <div
                            key={resource.id}
                            className={`rounded-lg border transition-colors ${
                              selected
                                ? "border-primary bg-primary/5"
                                : "hover:bg-muted/50"
                            }`}
                          >
                            <div className="flex items-center">
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedResourceId(resource.id)
                                }
                                className="flex min-w-0 flex-1 items-start gap-3 p-3 text-left"
                              >
                                <FileIcon
                                  className={`mt-0.5 h-5 w-5 ${fileType.iconClassName}`}
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">
                                    {resource.display_name}
                                  </span>
                                  <span className="block text-xs text-muted-foreground">
                                    {fileType.label}
                                  </span>
                                </span>
                              </button>
                              <div className="mr-3 flex shrink-0 items-center gap-1">
                                {/*
                                  🚨 ONE ACTION PER FILE, AND IT IS THE RECORD.
                                  Before F-58 a picked Doc's only in-app surface was
                                  a read-only textarea and a raw append box on this
                                  bench; the Record it should have opened could
                                  never be born. This control IS that birth door.
                                */}
                                {showRecordDoor && (
                                  <OpenGoogleDocumentRecordButton
                                    resource={pickedGoogleRecordResource({
                                      ...resource,
                                      ...freshRecords[resource.id],
                                    })}
                                    variant="ghost"
                                  />
                                )}
                                <a
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-primary-ink hover:bg-primary/10"
                                  aria-label={`Open ${resource.display_name} in Google`}
                                >
                                  Open in Google
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            </div>
                            {recordAbsent && fresh?.record_absent_reason ? (
                              <p className="flex items-start gap-1.5 px-3 pb-2 text-xs text-muted-foreground">
                                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                                <span className="min-w-0 flex-1">
                                  {resource.display_name} is picked and usable,
                                  but its record could not be created:{" "}
                                  {fresh.record_absent_reason}
                                </span>
                              </p>
                            ) : null}
                            {syncReason ? (
                              <p className="flex items-start gap-1.5 px-3 pb-2 text-xs text-muted-foreground">
                                <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                                <span className="min-w-0 flex-1">
                                  {syncReason}
                                </span>
                              </p>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>

                    {selectedResource?.resource_type ===
                      "google_spreadsheet" && (
                      <div className="space-y-4 rounded-lg border p-4">
                        <div>
                          <p className="font-medium">
                            {selectedResource.display_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Read or update one explicit A1 range. Values below
                            are tab-separated, one row per line.
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="sheet-range">A1 range</Label>
                          <Input
                            id="sheet-range"
                            value={sheetRange}
                            onChange={(event) =>
                              setSheetRange(event.currentTarget.value)
                            }
                            placeholder="A1:C10 or 'Sheet name'!A1:C10"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="sheet-values">Sheet values</Label>
                          <Textarea mono minHeight={160}
                            id="sheet-values"
                            value={sheetValues}
                            onChange={(event) =>
                              setSheetValues(event.currentTarget.value)
                            }
                            placeholder={"Name\tStatus\nExample\tReady"}
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            icon={busy === "read-file" && (
                              <Loader2 className="animate-spin" />
                            )}
                            type="button"
                            variant="outline"
                            onClick={readSelectedRange}
                            disabled={!sheetRange.trim() || busy !== null}
                          >
                            Read this range
                          </Button>
                          <Button
                            icon={busy === "write-file" && (
                              <Loader2 className="animate-spin" />
                            )}
                            variant="primary"
                            type="button"
                            onClick={writeSelectedRange}
                            disabled={
                              !sheetRange.trim() ||
                              !sheetValues.trim() ||
                              busy !== null
                            }
                          >
                            Update this range
                          </Button>
                        </div>
                      </div>
                    )}

                    {selectedPresentation && (
                      <PresentationFileDetail
                        resource={selectedPresentation}
                        pending={
                          slideReadDialog?.key === selectedPresentationKey &&
                          slideReadDialog.request === slideReadRequest.current &&
                          "pending" in slideReadDialog.state
                        }
                        onRead={readSelectedPresentation}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {activeConnection && (
        <Collapsible>
          <Card>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="group flex w-full items-center justify-between gap-3 p-4 text-left"
              >
                <span>
                  <span className="flex items-center gap-2 font-medium">
                    <Mail className="h-4 w-4 text-primary" />
                    Test the email connection
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Send one reviewed test email. This action requests only
                    sending permission.
                  </span>
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="space-y-4 border-t p-4">
                <p className="text-xs text-muted-foreground">
                  <code>gmail.send</code> sends only messages you review and
                  confirm.
                </p>

                {!gmailEnabled ? (
                  <Button
                    icon={busy === "enable-gmail" && (
                      <Loader2 className="animate-spin" />
                    )}
                    variant="primary"
                    type="button"
                    onClick={enableGmail}
                    disabled={!google.isGoogleLoaded || busy !== null}
                  >
                    Add Gmail sending
                  </Button>
                ) : (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Gmail sending is ready. This sending permission cannot
                      read your inbox.
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="email-to">To</Label>
                        <Input
                          id="email-to"
                          type="email"
                          value={emailTo}
                          onChange={(event) =>
                            setEmailTo(event.currentTarget.value)
                          }
                          placeholder="recipient@example.com"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="email-cc">
                          Cc (optional, comma-separated)
                        </Label>
                        <Input
                          id="email-cc"
                          value={emailCc}
                          onChange={(event) =>
                            setEmailCc(event.currentTarget.value)
                          }
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email-subject">Subject</Label>
                      <Input
                        id="email-subject"
                        value={emailSubject}
                        onChange={(event) =>
                          setEmailSubject(event.currentTarget.value)
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email-body">Message body</Label>
                      <ProTextarea
                        id="email-body"
                        value={emailBody}
                        onChange={(event) =>
                          setEmailBody(event.currentTarget.value)
                        }
                        className="min-h-28"
                      />
                    </div>
                    <label className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
                      <Checkbox
                        checked={emailConfirmed}
                        onCheckedChange={(checked) =>
                          setEmailConfirmed(checked === true)
                        }
                        className="mt-0.5"
                      />
                      <span>
                        I reviewed this exact email and want to send it now.
                      </span>
                    </label>
                    <Button
                      icon={busy === "send-email" && (
                        <Loader2 className="animate-spin" />
                      )}
                      variant="primary"
                      type="button"
                      onClick={sendEmail}
                      disabled={
                        !emailConfirmed ||
                        !emailTo.trim() ||
                        !emailSubject.trim() ||
                        !emailBody.trim() ||
                        busy !== null
                      }
                    >
                      Send this reviewed email
                    </Button>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
      <ReadResultsDialog
        result={
          slideReadDialog?.key === selectedPresentationKey &&
          slideReadDialog.request === slideReadRequest.current
            ? slideReadDialog.state
            : null
        }
        onClose={closeSlideRead}
      />
    </div>
  );
}

/**
 * The selected Google Slides deck and its explicit content read.
 *
 * It shows every fact
 * the registered row actually holds (name, what it is, when Google last saw it
 * edited, how it entered AI Matrx, when it was connected) and opens the door.
 * Nothing here is invented — there is no owner field on the row, so no owner is
 * claimed. The read is a deliberate action and shows the shared Slides result
 * rather than adding a second presentation renderer here.
 */
function PresentationFileDetail({
  resource,
  pending,
  onRead,
}: {
  resource: GoogleConnectionResource & {
    resource_type: "google_presentation";
  };
  pending: boolean;
  onRead: () => void;
}) {
  const fileType = googleWorkspaceFileType(resource.resource_type);
  const FileIcon = fileType.icon;
  const modified = resource.metadata.modified_time;
  const source = resource.metadata.selection_source;
  const facts: { label: string; value: string }[] = [
    { label: "What it is", value: fileType.label },
    ...(typeof modified === "string" && modified
      ? [
          {
            label: "Last edited in Google",
            value: new Date(modified).toLocaleString(),
          },
        ]
      : []),
    {
      label: "How it got here",
      value:
        source === "matrx_created"
          ? "AI Matrx created it for you"
          : "You chose it in Google Picker",
    },
    {
      label: "Connected",
      value: new Date(resource.discovered_at).toLocaleString(),
    },
  ];
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <FileIcon
            className={`mt-0.5 h-5 w-5 shrink-0 ${fileType.iconClassName}`}
          />
          <div className="min-w-0">
            <p className="truncate font-medium">{resource.display_name}</p>
            <p className="text-xs text-muted-foreground">
              Read the slide text and speaker notes stored in this deck.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            icon={pending ? <Loader2 className="animate-spin" /> : undefined}
            type="button"
            variant="primary"
            onClick={onRead}
            disabled={pending}
          >
            Read slides and notes
          </Button>
          <Button asChild type="button" variant="outline">
            <a
              href={resourceDoor(resource)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Google
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
        {facts.map((fact) => (
          <div key={fact.label} className="flex min-w-0 justify-between gap-3">
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className="truncate text-right text-foreground">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
