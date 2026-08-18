"use client";

/**
 * GoogleResourcePicker — attach a Google Doc or Sheet to this message.
 *
 * Deliberately visible even when Google is NOT connected: a user cannot ask for
 * a capability they do not know exists, so the row is always offered and the
 * unconnected state becomes the pitch plus a one-click connect.
 *
 * Connecting never leaves the page — it opens the floating Google window over
 * whatever the user was doing. Sending someone from a chat to a settings screen
 * to attach a file is the exact dead end this avoids.
 *
 * Attached files travel as the reserved `__google_files` context key. The server
 * resolves it (aidream `services/google_workspace/attachments.py`), names the
 * files for the agent, and injects the Google tool for that turn — so the agent
 * can actually open what the user attached.
 */

import { useCallback, useMemo, useState } from "react";
import { ExternalLink, FileText, Loader2, Plus, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";
import { ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";

export interface GoogleResourcePickerProps {
  onBack: () => void;
  /** Called with the file ids the user attached. */
  onSelect: (file: { fileId: string; name: string; isSheet: boolean }) => void;
  /** File ids already attached to this message, so they read as attached. */
  attachedFileIds?: readonly string[];
}

export function GoogleResourcePicker({
  onBack,
  onSelect,
  attachedFileIds = [],
}: GoogleResourcePickerProps) {
  const inventory = useGoogleConnectionInventory();
  const openConnect = useOpenGoogleConnectWindow();
  const [justAttached, setJustAttached] = useState<string[]>([]);

  const connected = useMemo(
    () =>
      (inventory.data?.connections ?? []).some(
        (row) =>
          row.health === "connected" &&
          row.scopes.includes(GOOGLE_SCOPE.driveFile),
      ),
    [inventory.data],
  );

  const files = useMemo(
    () =>
      (inventory.data?.resources ?? []).filter(
        (row) =>
          row.resource_type === "google_document" ||
          row.resource_type === "google_spreadsheet",
      ),
    [inventory.data],
  );

  const attached = useMemo(
    () => new Set([...attachedFileIds, ...justAttached]),
    [attachedFileIds, justAttached],
  );

  const connect = useCallback(() => {
    openConnect({ reason: "to attach a Google file to this message" });
    onBack();
  }, [openConnect, onBack]);

  return (
    <div className="flex flex-col">
      <ResourcePickerSubViewHeader title="Google" onBack={onBack} />

      {inventory.isLoading ? (
        <div className="flex items-center gap-2 px-3 py-6 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Checking your Google account…
        </div>
      ) : !connected ? (
        // The pitch, not an error. This is the whole reason the row is offered
        // to people who have not connected anything.
        <div className="flex flex-col gap-2 px-3 py-4">
          <p className="text-xs text-muted-foreground">
            Connect Google and you can hand a doc or sheet straight to an agent
            — it reads and updates only the files you choose.
          </p>
          <Button size="sm" onClick={connect}>
            Connect Google
          </Button>
        </div>
      ) : (
        <div className="flex flex-col">
          {files.length === 0 ? (
            <div className="flex flex-col gap-2 px-3 py-4">
              <p className="text-xs text-muted-foreground">
                No Google files chosen yet.
              </p>
              <Button size="sm" variant="outline" onClick={connect}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Choose a Doc or Sheet
              </Button>
            </div>
          ) : (
            <>
              <div className="max-h-64 overflow-y-auto">
                {files.map((file) => {
                  const isSheet = file.resource_type === "google_spreadsheet";
                  const Icon = isSheet ? Table2 : FileText;
                  const link = file.metadata?.web_view_link;
                  const isAttached = attached.has(file.resource_ref);
                  return (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent"
                    >
                      <button
                        type="button"
                        disabled={isAttached}
                        onClick={() => {
                          setJustAttached((ids) => [...ids, file.resource_ref]);
                          onSelect({
                            fileId: file.resource_ref,
                            name: file.display_name,
                            isSheet,
                          });
                        }}
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2 text-left",
                          isAttached && "opacity-60",
                        )}
                      >
                        <Icon
                          className={cn(
                            "h-4 w-4 shrink-0",
                            isSheet
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-sky-600 dark:text-sky-400",
                          )}
                        />
                        <span className="truncate text-sm text-foreground">
                          {file.display_name}
                        </span>
                        {isAttached ? (
                          <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                            Attached
                          </span>
                        ) : null}
                      </button>
                      {typeof link === "string" && link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="shrink-0 text-muted-foreground hover:text-foreground"
                          aria-label={`Open ${file.display_name} in Google`}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : null}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={connect}
                className="flex items-center gap-2 border-t border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Choose another file from Google
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
