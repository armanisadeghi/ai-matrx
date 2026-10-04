"use client";

// Temporary localhost interaction seat. Remove after independent review.
import { useState } from "react";
import { GoogleDriveLibraryContent, type GoogleDriveLibraryEnvironment } from "@/features/files/google-drive/GoogleDriveLibrary";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import type { DriveBrowsePage } from "@/features/marketing/google/service";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";

function connection(id: string, email: string): GoogleConnectionSummary {
  return {
    id,
    owner_type: "user",
    owner_user_id: "simulated-owner",
    organization_id: null,
    provider: "google",
    provider_subject: id,
    account_email: email,
    account_name: email,
    scopes: [GOOGLE_SCOPE.driveReadonly],
    status: "connected",
    last_verified_at: null,
    last_error: null,
    created_at: "2026-10-04T00:00:00Z",
    updated_at: "2026-10-04T00:00:00Z",
    metadata: {},
    credential_present: true,
    credential_stable: true,
    health: "connected",
    capability_health: {},
  };
}

const connections = [
  connection("simulated-harbor", "records@harbordental.test"),
  connection("simulated-river", "records@riverdental.test"),
];

function pageFor(connectionId: string): DriveBrowsePage {
  const account = connections.find((item) => item.id === connectionId) ?? connections[0];
  return {
    connection_id: account.id,
    source_account: account.account_email ?? "",
    source_owner_type: "user",
    source_owner_id: "simulated-owner",
    next_page_token: null,
    incomplete_search: false,
    files: [{
      id: `${connectionId}-intake-guide`,
      name: "New patient intake guide",
      mime_type: "application/vnd.google-apps.document",
      modified_at: "2026-10-03T14:00:00Z",
      web_view_link: null,
      owners: [],
      shared_drive: false,
    }, {
      id: `${connectionId}-consent-form`,
      name: "Signed consent form.pdf",
      mime_type: "application/pdf",
      modified_at: "2026-10-02T14:00:00Z",
      web_view_link: null,
      owners: [],
      shared_drive: false,
    }, {
      id: `${connectionId}-folder`,
      name: "Intake forms",
      mime_type: "application/vnd.google-apps.folder",
      modified_at: null,
      web_view_link: null,
      owners: [],
      shared_drive: false,
    }, {
      id: `${connectionId}-shortcut`,
      name: "Staff shortcut",
      mime_type: "application/vnd.google-apps.shortcut",
      modified_at: null,
      web_view_link: null,
      owners: [],
      shared_drive: false,
    }],
  };
}

export default function DriveImportReviewPage() {
  const [outcome, setOutcome] = useState<"success" | "failure" | "uncertain">("success");
  if (process.env.NODE_ENV === "production") return <p>Local review only.</p>;

  const environment: GoogleDriveLibraryEnvironment = {
    selectedOrganizationId: "simulated-destination-harbor",
    selectedOrganizationName: "Harbor Dental",
    connections,
    driveBrowse: { key: "drive_browse", rollout_phase: "internal_test", eligible: true },
    loadingConnections: false,
    connectionsError: false,
    browse: async ({ connectionId }) => pageFor(connectionId),
    checkAccess: async ({ connectionId, fileId }) => ({
      connection_id: connectionId,
      source_account: connections.find((item) => item.id === connectionId)?.account_email ?? "",
      source_owner_type: "user",
      source_owner_id: "simulated-owner",
      file: pageFor(connectionId).files.find((file) => file.id === fileId)!,
      accessible: true,
    }),
    importFile: async ({ connectionId, fileId, filePath }) => {
      if (outcome !== "success") {
        throw new Error(outcome === "uncertain"
          ? "The connection closed after the request. The save may have completed."
          : "Google could not provide this file.");
      }
      return {
        file_id: `simulated-saved-${fileId}`,
        file_path: filePath,
        checksum: "simulated",
        version_number: 1,
        created: true,
        source: { provider: "google_drive", connection_id: connectionId, source_ref: fileId },
      };
    },
  };

  return <>
    <aside className="fixed bottom-4 right-4 z-50 rounded-lg border border-amber-500 bg-card p-4 shadow-lg" aria-label="Local Drive import simulation">
      <p className="font-semibold">Simulated Drive import · no provider or database calls</p>
      <label className="mt-2 block text-sm">Import outcome
        <select className="ml-2 border bg-background" value={outcome} onChange={(event) => setOutcome(event.target.value as typeof outcome)}>
          <option value="success">Success</option>
          <option value="failure">Failure</option>
          <option value="uncertain">Uncertain</option>
        </select>
      </label>
    </aside>
    <GoogleDriveLibraryContent environment={environment} />
  </>;
}
