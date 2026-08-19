"use client";

/**
 * GoogleConnectWindow — connect Google, and pick a file, without leaving the page.
 *
 * Arman's ruling: a user who hits Google anywhere in the app must never be sent
 * off to a settings page to fix it. This floating window comes up over whatever
 * they were doing, does the one thing they needed, and gets out of the way.
 *
 * It is deliberately NOT a second Google implementation. Everything here calls
 * the same canonical pieces the settings surface calls — `useConnectGoogle`,
 * `pickGoogleWorkspaceFile`, `registerSelectedGoogleFile` — so there is exactly
 * one connect path and one register path in the product.
 *
 * `onFilesPicked` is how a caller (the chat resource picker) learns which files
 * the user chose, so it can attach them to the message.
 */

import { useCallback, useMemo, useState } from "react";
import {
  Check,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  Table2,
} from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";
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
import { pickGoogleWorkspaceFile } from "@/lib/googlePicker";
import type { SelectedGoogleFile } from "@/features/google-workspace/types";
import { extractErrorMessage } from "@/utils/errors";

const WINDOW_ID = "google-connect-window";
const OVERLAY_ID = "googleConnectWindow" as const;

export interface GoogleConnectWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** Fired whenever the user registers a file, so a caller can attach it. */
  onFilesPicked?: (files: SelectedGoogleFile[]) => void;
  /** Optional one-line reason, e.g. "to attach a doc to this message". */
  reason?: string | null;
}

export function GoogleConnectWindow(props: GoogleConnectWindowProps) {
  if (!props.isOpen) return null;
  return (
    <LazyGoogleAPIProvider scopes={[...GOOGLE_WORKSPACE_FILE_SCOPES]}>
      <GoogleConnectWindowBody {...props} />
    </LazyGoogleAPIProvider>
  );
}

function GoogleConnectWindowBody({
  isOpen,
  onClose,
  onFilesPicked,
  reason,
}: GoogleConnectWindowProps) {
  const google = useGoogleAPI();
  const connectGoogle = useConnectGoogle();
  const inventory = useGoogleConnectionInventory();
  const [busy, setBusy] = useState<string | null>(null);

  const connection = useMemo(() => {
    const rows = inventory.data?.connections ?? [];
    return (
      rows.find(
        (row) =>
          row.health === "connected" &&
          row.scopes.includes(GOOGLE_SCOPE.driveFile),
      ) ?? null
    );
  }, [inventory.data]);

  const canSend = Boolean(
    connection?.scopes.includes(GOOGLE_SCOPE.gmailSend),
  );

  const files = useMemo(() => {
    const rows = inventory.data?.resources ?? [];
    return rows.filter(
      (row) =>
        row.resource_type === "google_document" ||
        row.resource_type === "google_spreadsheet",
    );
  }, [inventory.data]);

  const run = useCallback(
    async (key: string, work: () => Promise<void>) => {
      setBusy(key);
      try {
        await work();
      } catch (cause) {
        toast.error(extractErrorMessage(cause));
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const connect = () =>
    void run("connect", async () => {
      const code = await google.requestAuthorizationCode([
        ...GOOGLE_WORKSPACE_FILE_SCOPES,
      ]);
      await connectGoogle.mutateAsync({ code, owner: { type: "user" } });
      await inventory.refetch();
      toast.success("Google connected.");
    });

  const enableSending = () =>
    void run("send", async () => {
      const code = await google.requestAuthorizationCode(
        [...GOOGLE_WORKSPACE_SEND_SCOPES],
        connection?.account_email ?? undefined,
      );
      await connectGoogle.mutateAsync({ code, owner: { type: "user" } });
      await inventory.refetch();
      toast.success("Email sending enabled.");
    });

  const chooseFile = () =>
    void run("pick", async () => {
      if (!connection) return;
      const accessToken = await google.signIn(
        [...GOOGLE_WORKSPACE_FILE_SCOPES],
        connection.account_email ?? undefined,
      );
      if (!accessToken) {
        throw new Error("Google did not grant access to choose a file.");
      }
      const picked = await pickGoogleWorkspaceFile(accessToken);
      if (!picked) return;
      const registered = await registerSelectedGoogleFile(
        connection.id,
        picked.id,
      );
      await inventory.refetch();
      onFilesPicked?.([registered]);
      toast.success(`${registered.name} is ready to use.`);
    });

  return (
    <WindowPanel
      id={WINDOW_ID}
      overlayId={OVERLAY_ID}
      onClose={onClose}
      titleNode={
        <span className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-primary" />
          Google
        </span>
      }
      width={420}
      height={480}
      minWidth={340}
      minHeight={320}
      position="center"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto"
    >
      <div className="flex flex-col gap-3 p-3">
        {inventory.isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your Google account…
          </div>
        ) : !connection ? (
          <div className="flex flex-col gap-2">
            {/* The caller's reason replaces the generic line rather than
                stacking on top of it — saying the same thing twice is how a
                small panel starts feeling like a form. */}
            <p className="text-sm text-foreground">
              {reason
                ? `Connect Google ${reason}.`
                : "Connect Google and AI Matrx can work with the docs and sheets you choose."}{" "}
              <span className="text-muted-foreground">
                Nothing else in your Drive.
              </span>
            </p>
            <Button size="sm" onClick={connect} disabled={busy === "connect"}>
              {busy === "connect" ? "Connecting…" : "Connect Google"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-sm text-foreground">
              <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <span className="truncate">
                {connection.account_email ?? "Connected"}
              </span>
            </div>

            <Button
              size="sm"
              variant="outline"
              onClick={chooseFile}
              disabled={busy === "pick"}
            >
              {busy === "pick" ? "Opening Google…" : "Choose a Doc or Sheet"}
            </Button>

            {files.length ? (
              <div className="overflow-hidden rounded-md border border-border">
                {files.map((file) => {
                  const isSheet = file.resource_type === "google_spreadsheet";
                  const link = file.metadata?.web_view_link;
                  const Icon = isSheet ? Table2 : FileText;
                  return (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 border-b border-border/60 px-2.5 py-1.5 last:border-b-0"
                    >
                      <Icon
                        className={
                          isSheet
                            ? "h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                            : "h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400"
                        }
                      />
                      <span className="truncate text-sm text-foreground">
                        {file.display_name}
                      </span>
                      {typeof link === "string" && link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={`Open ${file.display_name} in Google`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No files chosen yet. Pick one and it stays available to you and
                your agents.
              </p>
            )}

            {!canSend ? (
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
                  disabled={busy === "send"}
                >
                  {busy === "send" ? "Enabling…" : "Enable email sending"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </WindowPanel>
  );
}

export default GoogleConnectWindow;
