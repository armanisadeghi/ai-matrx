"use client";

import { LazyGoogleAPIProvider } from "@/providers/google-provider/LazyGoogleAPIProvider";
import { GOOGLE_WORKSPACE_FILE_SCOPES } from "@/lib/googleScopes";
import { GoogleWorkspaceReviewWorkspace } from "@/features/google-workspace/GoogleWorkspaceReviewWorkspace";

export function GoogleWorkspaceReviewRoot() {
  return (
    <LazyGoogleAPIProvider scopes={[...GOOGLE_WORKSPACE_FILE_SCOPES]}>
      <GoogleWorkspaceReviewWorkspace />
    </LazyGoogleAPIProvider>
  );
}
