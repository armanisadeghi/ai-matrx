"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Unplug,
} from "lucide-react";
import { toast } from "@/lib/toast";
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
import { Input } from "@/components/ui/input";
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
import {
  appendGoogleDocument,
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
import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";

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

function workspaceResource(
  resource: GoogleConnectionResource,
): resource is GoogleConnectionResource & {
  resource_type: "google_document" | "google_spreadsheet";
} {
  return (
    resource.resource_type === "google_document" ||
    resource.resource_type === "google_spreadsheet"
  );
}

function metadataLink(resource: GoogleConnectionResource): string | null {
  const value = resource.metadata.web_view_link;
  return typeof value === "string" && value ? value : null;
}

interface GoogleWorkspaceReviewWorkspaceProps {
  pickerInitialQuery?: string;
}

export function GoogleWorkspaceReviewWorkspace({
  pickerInitialQuery,
}: GoogleWorkspaceReviewWorkspaceProps) {
  const google = useGoogleAPI();
  const inventory = useGoogleConnectionInventory();
  const connectGoogle = useConnectGoogle();
  const disconnectGoogle = useDisconnectGoogle();
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(
    null,
  );
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [documentText, setDocumentText] = useState("");
  const [documentAppend, setDocumentAppend] = useState("");
  const [sheetRange, setSheetRange] = useState("Sheet1!A1:C10");
  const [sheetValues, setSheetValues] = useState("");
  const [emailTo, setEmailTo] = useState("");
  const [emailCc, setEmailCc] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailConfirmed, setEmailConfirmed] = useState(false);

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
  const selectedResources = useMemo(
    () =>
      (inventory.data?.resources ?? []).filter(
        (resource) =>
          resource.connection_id === effectiveConnectionId &&
          workspaceResource(resource),
      ),
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
      const message = errorMessage(operationError);
      setError(message);
      toast.error(message);
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
      setActiveConnectionId(result.connectionId);
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
      setActiveConnectionId(result.connectionId);
      toast.success("Reviewed Gmail sending is enabled.");
    });
  };

  const chooseFile = () => {
    if (!activeConnection) return;
    void run("pick-file", async () => {
      const accessToken = await google.signIn(
        [...GOOGLE_WORKSPACE_FILE_SCOPES],
        activeConnection.account_email ?? undefined,
      );
      if (!accessToken) {
        throw new Error("Google did not provide access for file selection.");
      }
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
      toast.success(`${registered.name} is ready.`);
    });
  };

  const readSelected = () => {
    if (!activeConnection || !selectedResource) return;
    void run("read-file", async () => {
      if (selectedResource.resource_type === "google_document") {
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
        sheetRange,
      );
      setSheetValues(result.values.map((row) => row.join("\t")).join("\n"));
      toast.success(`Loaded ${result.range}.`);
    });
  };

  const writeSelected = () => {
    if (!activeConnection || !selectedResource) return;
    void run("write-file", async () => {
      if (selectedResource.resource_type === "google_document") {
        const result = await appendGoogleDocument(
          activeConnection.id,
          selectedResource.resource_ref,
          documentAppend,
        );
        setDocumentText(result.text);
        setDocumentAppend("");
        toast.success("Text appended to the selected Google Doc.");
        return;
      }
      const values = sheetValues.split("\n").map((row) => row.split("\t"));
      const result = await writeGoogleSheet(
        activeConnection.id,
        selectedResource.resource_ref,
        sheetRange,
        values,
      );
      setSheetValues(result.values.map((row) => row.join("\t")).join("\n"));
      toast.success(`Updated ${result.range}.`);
    });
  };

  const sendEmail = () => {
    if (!activeConnection || !emailConfirmed) return;
    void run("send-email", async () => {
      const messageId = await sendReviewedGmail({
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
      toast.success(`Gmail sent (message ${messageId}).`);
    });
  };

  const disconnect = () => {
    if (!activeConnection) return;
    void run("disconnect", async () => {
      await disconnectGoogle.mutateAsync(activeConnection.id);
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
    <div className="mx-auto w-full max-w-5xl space-y-5 p-4 sm:p-6 lg:p-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Google Workspace connection</Badge>
          <Badge variant="secondary">Selected files only</Badge>
          <Badge variant="secondary">No Gmail reading</Badge>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Google Workspace in AI Matrx
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground sm:text-base">
            Work with source-of-truth Google Docs and Sheets inside AI Matrx,
            then send a final email only after reviewing it. These
            actions require Google authorization because AI Matrx cannot access
            your private files or send from your Gmail account without it.
          </p>
        </div>
      </header>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Action could not be completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" />
            1. Connect selected Docs & Sheets
          </CardTitle>
          <CardDescription>
            This permission is requested here, when you choose to use the
            feature—not during ordinary AI Matrx sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-5 pt-0">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
            <p className="font-medium">Before you continue</p>
            <p className="mt-1">
              AI Matrx will use Google Drive&apos;s <code>drive.file</code>
              permission to access only the Google Docs and Sheets you
              explicitly select. AI Matrx cannot browse your whole Drive. It
              reads or updates a selected file only when you use the visible
              action for that file. Your Google Workspace content is not sold or
              used to train generalized AI models. You can disconnect at any
              time.
            </p>
            <Link
              href="/privacy-policy"
              className="mt-2 inline-flex items-center gap-1 font-medium underline underline-offset-4"
              target="_blank"
            >
              Read the AI Matrx Privacy Policy
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="google-account">Google account</Label>
              <select
                id="google-account"
                value={effectiveConnectionId ?? ""}
                onChange={(event) =>
                  setActiveConnectionId(event.currentTarget.value || null)
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                disabled={personalConnections.length === 0 || busy !== null}
              >
                <option value="">No Google account connected</option>
                {personalConnections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.account_email ??
                      connection.account_name ??
                      "Google account"}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              onClick={() => void connectFiles()}
              disabled={!google.isGoogleLoaded || busy !== null}
            >
              {busy === "connect-files" && <Loader2 className="animate-spin" />}
              {filesEnabled
                ? "Reconnect Docs & Sheets"
                : "Connect Docs & Sheets"}
            </Button>
          </div>

          {filesEnabled && activeConnection && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Connected as{" "}
                    {activeConnection.account_email ?? "Google user"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Choose one file at a time. Each selection is recorded and
                    can be used only through this connection.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={chooseFile}
                  disabled={busy !== null}
                >
                  {busy === "pick-file" && <Loader2 className="animate-spin" />}
                  Choose a Google Doc or Sheet
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {filesEnabled && (
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5 text-primary" />
              2. Use a file you selected
            </CardTitle>
            <CardDescription>
              The controls below demonstrate the exact read and update actions
              covered by the selected-file permission.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            {selectedResources.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No file has been selected. Use Google Picker above to choose one
                Doc or Sheet.
              </div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {selectedResources.map((resource) => {
                    const link = metadataLink(resource);
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
                          {resource.resource_type === "google_document" ? (
                            <FileText className="mt-0.5 h-5 w-5 text-blue-600" />
                          ) : (
                            <FileSpreadsheet className="mt-0.5 h-5 w-5 text-emerald-600" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {resource.display_name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              {resource.resource_type === "google_document"
                                ? "Google Doc"
                                : "Google Sheet"}
                            </span>
                          </span>
                        </button>
                        {link && (
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
                        )}
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
                      <Label htmlFor="document-content">Document content</Label>
                      <Textarea
                        id="document-content"
                        value={documentText}
                        readOnly
                        placeholder="The selected document content appears here."
                        className="min-h-40"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="document-append">Text to append</Label>
                      <Textarea
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

                {selectedResource?.resource_type === "google_spreadsheet" && (
                  <div className="space-y-4 rounded-lg border p-4">
                    <div>
                      <p className="font-medium">
                        {selectedResource.display_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Read or update one explicit A1 range. Values below are
                        tab-separated, one row per line.
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
                        placeholder="Sheet1!A1:C10"
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
              </>
            )}
          </CardContent>
        </Card>
      )}

      {filesEnabled && activeConnection && (
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Mail className="h-5 w-5 text-primary" />
              3. Review and send with Gmail
            </CardTitle>
            <CardDescription>
              Gmail authorization is separate and requested only when you choose
              to enable this sending feature.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-0">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <p className="font-medium">Before enabling Gmail sending</p>
              <p className="mt-1">
                AI Matrx will use <code>gmail.send</code> only to send a message
                from your Gmail account after you review its recipients,
                subject, and body and explicitly confirm it. AI Matrx does not
                request permission to read, search, delete, or manage your Gmail
                messages.
              </p>
            </div>

            {!gmailEnabled ? (
              <Button
                type="button"
                onClick={enableGmail}
                disabled={!google.isGoogleLoaded || busy !== null}
              >
                {busy === "enable-gmail" && (
                  <Loader2 className="animate-spin" />
                )}
                Enable reviewed Gmail sending
              </Button>
            ) : (
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Gmail sending enabled—no Gmail read access
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
                  <Textarea
                    id="email-body"
                    value={emailBody}
                    onChange={(event) =>
                      setEmailBody(event.currentTarget.value)
                    }
                    className="min-h-40"
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
                    I reviewed the recipients, subject, and complete message
                    body above. Send this exact email now.
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
        </Card>
      )}

      {activeConnection && (
        <Card>
          <CardHeader className="p-5 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <LockKeyhole className="h-4 w-4" />
              Connection control
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 p-5 pt-0 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Disconnecting revokes Google authorization and removes the saved
              server-side credential and selected-file references.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={disconnect}
              disabled={busy !== null}
            >
              {busy === "disconnect" ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Unplug />
              )}
              Disconnect Google
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
