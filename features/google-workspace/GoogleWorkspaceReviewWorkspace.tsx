"use client";

import { useMemo, useState } from "react";
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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Input } from "@ai-matrx/design-system";
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
  type GoogleWorkspaceResourceType,
} from "@/features/google-workspace/resource-types";
import {
  DEFAULT_GOOGLE_SHEET_RANGE,
  SENT_FOR_APPROVAL_MESSAGE,
  appendGoogleDocument,
  approvalQueueHref,
  isGoogleWorkspaceInputError,
  readGoogleDocument,
  readGoogleSheet,
  registerSelectedGoogleFile,
  sendReviewedGmail,
  writeGoogleSheet,
} from "@/features/google-workspace/service";
import {
  GOOGLE_SCOPE,
  GOOGLE_WORKSPACE_FILE_SCOPES,
  GOOGLE_WORKSPACE_SEND_SCOPES,
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
import { getGoogleDrivePickerToken } from "@/features/google-workspace/drivePickerToken";

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
  return connection.scopes.includes(scope);
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

interface GoogleWorkspaceReviewWorkspaceProps {
  pickerInitialQuery?: string;
}

export function GoogleWorkspaceReviewWorkspace({
  pickerInitialQuery,
}: GoogleWorkspaceReviewWorkspaceProps) {
  const router = useRouter();
  const google = useGoogleAPI();
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
  const [documentText, setDocumentText] = useState("");
  const [documentAppend, setDocumentAppend] = useState("");
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
      const code = await google.requestAuthorizationCode([
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
      const code = await google.requestAuthorizationCode(
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
      await inventory.refetch();
      setSelectedResourceId(registered.id);
      recordToast.success(
        {
          type: "google_workspace_resource",
          id: registered.id,
          title: registered.name,
        },
        `${registered.name} is ready.`,
      );
    });
  };

  const readSelected = () => {
    if (!activeConnection || !selectedResource) return;
    const fileType = googleWorkspaceFileType(selectedResource.resource_type);
    // A file type with no client read NEVER falls through to the Sheets
    // reader. That fall-through is what the old `if Doc … else sheet` did to a
    // Slides deck: it asked the Sheets API for a presentation id and showed
    // Google's error as if the deck were broken.
    if (fileType.clientRead === null) {
      toast.info(`${fileType.label}s cannot be read on this screen yet.`, {
        description: fileType.readOnlyNote ?? undefined,
      });
      return;
    }
    void run("read-file", async () => {
      if (fileType.clientRead === "document") {
        const result = await readGoogleDocument(
          activeConnection.id,
          selectedResource.resource_ref,
        );
        setDocumentText(result.text);
        toast.success("Google Doc loaded.");
        return;
      }
      const result = await readGoogleSheet(
        activeConnection.id,
        selectedResource.resource_ref,
        sheetRange.trim(),
      );
      setSheetValues(result.values.map((row) => row.join("\t")).join("\n"));
      toast.success(`Loaded ${result.range}.`);
    });
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

  const writeSelected = () => {
    if (!activeConnection || !selectedResource) return;
    const fileType = googleWorkspaceFileType(selectedResource.resource_type);
    if (!fileType.writable) {
      toast.info(`AI Matrx does not write to ${fileType.label}s.`, {
        description: fileType.readOnlyNote ?? undefined,
      });
      return;
    }
    void run("write-file", async () => {
      if (fileType.clientRead === "document") {
        const outcome = await appendGoogleDocument(
          activeConnection.id,
          selectedResource.resource_ref,
          documentAppend,
        );
        if (outcome.proposed) {
          sentForApproval(outcome.assistId);
          return;
        }
        setDocumentText(outcome.result.text);
        setDocumentAppend("");
        toast.success("Text appended to the selected Google Doc.");
        return;
      }
      const values = sheetValues.split("\n").map((row) => row.split("\t"));
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
      setSheetValues(
        outcome.result.values.map((row) => row.join("\t")).join("\n"),
      );
      toast.success(`Updated ${outcome.result.range}.`);
    });
  };

  const sendEmail = () => {
    if (!activeConnection || !emailConfirmed) return;
    void run("send-email", async () => {
      rememberGoogleConnection("gmail-send", activeConnection.id);
      const receipt = await sendReviewedGmail({
        connectionId: activeConnection.id,
        to: emailTo,
        cc: emailCc
          .split(",")
          .map((address) => address.trim())
          .filter(Boolean),
        subject: emailSubject,
        body: emailBody,
      });
      setEmailConfirmed(false);
      // The server says who it reached; this bench shows it, because "sent" with
      // no recipient is exactly the claim lane B-10 made checkable.
      const reached = receipt.to ?? emailTo;
      toast.success(`Gmail sent to ${reached} (message ${receipt.messageId}).`);
    });
  };

  const disconnect = () => {
    if (!activeConnection) return;
    void run("disconnect", async () => {
      await disconnectGoogle.mutateAsync(activeConnection.id);
      if (pickerSessionConnectionId === activeConnection.id) {
        setPickerSessionConnectionId(null);
      }
      setActiveConnectionId(null);
      setSelectedResourceId(null);
      toast.success("Google account disconnected and authorization revoked.");
    });
  };

  const filesEnabled = Boolean(
    activeConnection && hasScope(activeConnection, GOOGLE_SCOPE.driveFile),
  );
  const gmailEnabled = Boolean(
    activeConnection && hasScope(activeConnection, GOOGLE_SCOPE.gmailSend),
  );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 p-3 sm:p-4">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Google Workspace
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage connected accounts and the Google access each one has.
        </p>
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
            type="button"
            size="sm"
            onClick={() => void connectFiles()}
            disabled={!google.isGoogleLoaded || busy !== null}
          >
            {busy === "connect-files" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Plus />
            )}
            Add account
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-y bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Account</th>
                  <th className="px-4 py-2 font-medium">Docs & Sheets</th>
                  <th className="px-4 py-2 font-medium">Gmail sending</th>
                  <th className="px-4 py-2 font-medium">Connection</th>
                  <th className="px-4 py-2 font-medium">Google session</th>
                  <th className="px-4 py-2 text-right font-medium">Manage</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {inventory.isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center">
                      <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />
                    </td>
                  </tr>
                ) : personalConnections.length === 0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      No Google accounts connected.
                    </td>
                  </tr>
                ) : (
                  personalConnections.map((connection) => {
                    const selected = connection.id === effectiveConnectionId;
                    const docsGranted = hasScope(
                      connection,
                      GOOGLE_SCOPE.driveFile,
                    );
                    const gmailGranted = hasScope(
                      connection,
                      GOOGLE_SCOPE.gmailSend,
                    );
                    const signedIn =
                      google.isAuthenticated &&
                      pickerSessionConnectionId === connection.id;
                    return (
                      <tr
                        key={connection.id}
                        className={selected ? "bg-primary/5" : undefined}
                      >
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            onClick={() =>
                              selectWorkspaceConnection(connection.id)
                            }
                            className="max-w-64 truncate text-left font-medium hover:text-primary hover:underline"
                          >
                            {connectionName(connection)}
                          </button>
                        </td>
                        <td
                          className={
                            docsGranted
                              ? "px-4 py-2.5 text-emerald-700 dark:text-emerald-400"
                              : "px-4 py-2.5 text-muted-foreground"
                          }
                        >
                          {docsGranted ? "Granted" : "Not granted"}
                        </td>
                        <td
                          className={
                            gmailGranted
                              ? "px-4 py-2.5 text-emerald-700 dark:text-emerald-400"
                              : "px-4 py-2.5 text-muted-foreground"
                          }
                        >
                          {gmailGranted ? "Granted" : "Not granted"}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1.5">
                            {connection.health === "connected" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            ) : (
                              <CircleAlert className="h-3.5 w-3.5 text-amber-600" />
                            )}
                            {connectionStatus(connection)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-muted-foreground">
                          {signedIn ? "Signed in" : "Sign-in when needed"}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <Button
                            type="button"
                            size="sm"
                            variant={selected ? "secondary" : "ghost"}
                            onClick={() =>
                              selectWorkspaceConnection(connection.id)
                            }
                          >
                            {selected ? "Selected" : "Manage"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void connectFiles()}
              disabled={!google.isGoogleLoaded || busy !== null}
            >
              {busy === "connect-files" && <Loader2 className="animate-spin" />}
              {filesEnabled
                ? "Refresh Docs & Sheets access"
                : "Add Docs & Sheets access"}
            </Button>
            {!gmailEnabled && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={enableGmail}
                disabled={!google.isGoogleLoaded || busy !== null}
              >
                {busy === "enable-gmail" && (
                  <Loader2 className="animate-spin" />
                )}
                Add Gmail sending
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={disconnect}
              disabled={busy !== null}
            >
              {busy === "disconnect" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Unplug />
              )}
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
                    Picker can access only Docs and Sheets you explicitly
                    select.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={chooseFile}
                    disabled={busy !== null}
                  >
                    {busy === "pick-file" && (
                      <Loader2 className="animate-spin" />
                    )}
                    {googleWorkspacePickLabel()}
                  </Button>
                </div>
                {selectedResources.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    No selected files for this account.
                  </div>
                ) : (
                  <>
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
                        return (
                          <div
                            key={resource.id}
                            className={`flex items-center rounded-lg border transition-colors ${
                              selected
                                ? "border-primary bg-primary/5"
                                : "hover:bg-muted/50"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedResourceId(resource.id)}
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
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mr-3 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                              aria-label={`Open ${resource.display_name} in Google`}
                            >
                              Open in Google
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </div>
                        );
                      })}
                    </div>

                    {selectedResource?.resource_type === "google_document" && (
                      <div className="space-y-4 rounded-lg border p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">
                              {selectedResource.display_name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Read the document or append text at its end.
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={readSelected}
                            disabled={busy !== null}
                          >
                            {busy === "read-file" && (
                              <Loader2 className="animate-spin" />
                            )}
                            Read selected Doc
                          </Button>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="document-content">
                            Document content
                          </Label>
                          <Textarea
                            id="document-content"
                            value={documentText}
                            readOnly
                            placeholder="The selected document content appears here."
                            className="min-h-40"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="document-append">
                            Text to append
                          </Label>
                          <ProTextarea
                            id="document-append"
                            value={documentAppend}
                            onChange={(event) =>
                              setDocumentAppend(event.currentTarget.value)
                            }
                            placeholder="Enter the exact text to add to this Doc."
                          />
                        </div>
                        <Button
                          type="button"
                          onClick={writeSelected}
                          disabled={!documentAppend.trim() || busy !== null}
                        >
                          {busy === "write-file" && (
                            <Loader2 className="animate-spin" />
                          )}
                          Append this text
                        </Button>
                      </div>
                    )}

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
                          <Textarea
                            id="sheet-values"
                            value={sheetValues}
                            onChange={(event) =>
                              setSheetValues(event.currentTarget.value)
                            }
                            placeholder={"Name\tStatus\nExample\tReady"}
                            className="min-h-40 font-mono text-xs"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={readSelected}
                            disabled={!sheetRange.trim() || busy !== null}
                          >
                            {busy === "read-file" && (
                              <Loader2 className="animate-spin" />
                            )}
                            Read this range
                          </Button>
                          <Button
                            type="button"
                            onClick={writeSelected}
                            disabled={
                              !sheetRange.trim() ||
                              !sheetValues.trim() ||
                              busy !== null
                            }
                          >
                            {busy === "write-file" && (
                              <Loader2 className="animate-spin" />
                            )}
                            Update this range
                          </Button>
                        </div>
                      </div>
                    )}

                    {selectedResource &&
                      googleWorkspaceFileType(selectedResource.resource_type)
                        .clientRead === null && (
                        <ReadOnlyFileDetail resource={selectedResource} />
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
                    Send one reviewed test email. Gmail reading is never
                    requested.
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
                    type="button"
                    onClick={enableGmail}
                    disabled={!google.isGoogleLoaded || busy !== null}
                  >
                    {busy === "enable-gmail" && (
                      <Loader2 className="animate-spin" />
                    )}
                    Add Gmail sending
                  </Button>
                ) : (
                  <div className="space-y-3 rounded-lg border p-3">
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Gmail sending is ready; Gmail reading is not allowed.
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
                      {busy === "send-email" && (
                        <Loader2 className="animate-spin" />
                      )}
                      Send this reviewed email
                    </Button>
                  </div>
                )}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}
    </div>
  );
}
/**
 * A connected file this client has no reader for — today, a Google Slides deck.
 *
 * It is NOT a blank panel and NOT a disabled-looking one: it shows every fact
 * the registered row actually holds (name, what it is, when Google last saw it
 * edited, how it entered AI Matrx, when it was connected) and opens the door.
 * Nothing here is invented — there is no owner field on the row, so no owner is
 * claimed — and it says in one sentence why the slides themselves are not on
 * this screen, which is the difference between an honest surface and a dead end.
 */
function ReadOnlyFileDetail({
  resource,
}: {
  resource: GoogleConnectionResource & {
    resource_type: GoogleWorkspaceResourceType;
  };
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
              {fileType.readOnlyNote}
            </p>
          </div>
        </div>
        <Button asChild type="button" variant="outline" size="sm">
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
