"use client";

/**
 * GoogleResourcePicker — attach one of a person's connected Google Workspace
 * files to this message. Which file types those are is the ONE record
 * (`features/google-workspace/resource-types.ts`), never a list written here.
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

import { useState } from "react";
import { ExternalLink, Loader2, Plus } from "lucide-react";
import {
  googleWorkspaceFileType,
  googleWorkspacePickLabel,
  type GoogleWorkspaceResourceType,
} from "@/features/google-workspace/resource-types";
import { isGoogleWorkspaceFileRow } from "@/features/marketing/google/types";
import { Button } from "@ai-matrx/design-system";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";
import { GoogleAccountSelect } from "@/features/google-workspace/GoogleAccountSelect";
import {
  eligibleGoogleConnections,
  preferredGoogleConnectionId,
  rememberGoogleConnection,
} from "@/features/google-workspace/connection";
import {
  PickerRow,
  PickerView,
  PickerViewBody,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";
import { ReadFailure } from "@ai-matrx/design-system";

export interface GoogleResourcePickerProps {
  onBack: () => void;
  /** Called with the file ids the user attached. */
  /**
   * The picked file, carrying its REAL type. It used to carry `isSheet: boolean`
   * — a boolean cannot say "Slides deck", so a third file type would have been
   * attached to the conversation as a Sheet.
   */
  onSelect: (file: {
    fileId: string;
    name: string;
    resourceType: GoogleWorkspaceResourceType;
  }) => void;
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
  const [selectedConnectionId, setSelectedConnectionId] = useState<
    string | null
  >(() => preferredGoogleConnectionId("workspace"));

  const connections = eligibleGoogleConnections(
    inventory.data?.connections ?? [],
    "workspace",
    selectedConnectionId,
  );
  const selectedConnection =
    connections.find((row) => row.id === selectedConnectionId) ??
    connections[0] ??
    null;

  const files = (inventory.data?.resources ?? [])
    .filter((row) => row.connection_id === selectedConnection?.id)
    .filter(isGoogleWorkspaceFileRow);

  const attached = new Set([...attachedFileIds, ...justAttached]);

  const connect = () => {
    openConnect({
      reason: "to attach a Google file to this message",
      initialConnectionId: selectedConnection?.id,
    });
    onBack();
  };

  const selectConnection = (connectionId: string) => {
    setSelectedConnectionId(connectionId);
    rememberGoogleConnection("workspace", connectionId);
  };

  return (
    <PickerView>
      <ResourcePickerSubViewHeader title="Google" onBack={onBack} />
      <PickerViewBody>
        {inventory.isLoading ? (
          <div className="flex items-center gap-2 px-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking your Google account…
          </div>
        ) : inventory.isError && !inventory.data ? (
          <ReadFailure
            error={inventory.error}
            what="your Google connections and files"
            onRetry={() => void inventory.refetch()}
          />
        ) : !selectedConnection ? (
          // The pitch, not an error. This is the whole reason the row is offered
          // to people who have not connected anything.
          <div className="flex flex-col gap-3 px-2 py-4">
            <p className="text-sm text-muted-foreground">
              Connect Google to hand a doc or sheet to an agent.
            </p>
            <Button onClick={connect}>Connect Google</Button>
          </div>
        ) : (
          <>
            <GoogleAccountSelect
              connections={connections}
              connectionId={selectedConnection.id}
              onConnectionChange={selectConnection}
              className="px-1.5 pb-2"
            />
            {files.length === 0 ? (
              <div className="flex flex-col gap-3 px-2 py-4">
                <p className="text-sm text-muted-foreground">
                  No Google files chosen yet.
                </p>
                <Button variant="outline" onClick={connect}>
                  <Plus className="mr-1.5 h-4 w-4" />
                  {googleWorkspacePickLabel()}
                </Button>
              </div>
            ) : (
              <>
                {files.map((file) => {
                  const fileType = googleWorkspaceFileType(file.resource_type);
                  const link =
                    typeof file.metadata?.web_view_link === "string" &&
                    file.metadata.web_view_link
                      ? file.metadata.web_view_link
                      : fileType.hrefFor(file.resource_ref);
                  const isAttached = attached.has(file.resource_ref);
                  return (
                    <div key={file.id} className="flex items-center gap-1">
                      <div className="min-w-0 flex-1">
                        <PickerRow
                          icon={fileType.icon}
                          iconClassName={fileType.iconClassName}
                          label={file.display_name}
                          trailing={
                            isAttached ? (
                              <span className="shrink-0 text-xs text-muted-foreground">
                                Attached
                              </span>
                            ) : null
                          }
                          selected={isAttached}
                          disabled={isAttached}
                          onClick={() => {
                            setJustAttached((ids) => [...ids, file.resource_ref]);
                            onSelect({
                              fileId: file.resource_ref,
                              name: file.display_name,
                              resourceType: file.resource_type,
                            });
                          }}
                        />
                      </div>
                      {typeof link === "string" && link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground pointer-coarse:h-11 pointer-coarse:w-11"
                          aria-label={`Open ${file.display_name} in Google`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      ) : null}
                    </div>
                  );
                })}
                <div className="mt-1 border-t border-border pt-1">
                  <PickerRow
                    icon={Plus}
                    label="Choose another file from Google"
                    onClick={connect}
                  />
                </div>
              </>
            )}
          </>
        )}
      </PickerViewBody>
    </PickerView>
  );
}
