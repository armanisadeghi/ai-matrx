/** Resolve a short-lived Google Picker token through the canonical broker. */

import { getBrokeredCredential } from "@/lib/api/broker/cache";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";

export async function getGoogleDrivePickerToken(
  connection: Pick<GoogleConnectionSummary, "id">,
): Promise<string> {
  const credential = await getBrokeredCredential({
    audience: "google_drive_picker",
    tierPolicy: "none",
    scopes: [`connection:${connection.id}`, GOOGLE_SCOPE.driveFile],
  });
  if (
    credential.credential_mode !== "native_ephemeral" ||
    credential.protocol !== "google_drive_picker"
  ) {
    throw new Error("The credential broker returned the wrong Google capability.");
  }
  return credential.token;
}
