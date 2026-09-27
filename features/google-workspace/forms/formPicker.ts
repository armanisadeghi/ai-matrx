/**
 * Connection-bound entry point for the selected Google Form Picker.
 *
 * Forms are deliberately outside generic Workspace resource registration. The
 * caller receives only the selected Form and the connection ID whose existing
 * `drive.file` grant opened the Picker. Account identity must be resolved again
 * from that connection at the server boundary before any Forms read.
 */

import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { getGoogleDrivePickerToken } from "@/features/google-workspace/drivePickerToken";
import { pickGoogleForm, type PickedGoogleForm } from "@/lib/googlePicker";

export type GoogleFormPickerConnection = Pick<GoogleConnectionSummary, "id">;

export interface SelectedGoogleForm {
  id: string;
  name: string;
  mimeType: PickedGoogleForm["mimeType"];
  connection_id: string;
}

/**
 * Mint the existing, exact-connection `drive.file` Picker credential, then
 * open Forms-only selection. This does not request consent or register data.
 */
export async function pickGoogleFormForConnection(
  connection: GoogleFormPickerConnection,
): Promise<SelectedGoogleForm | null> {
  const accessToken = await getGoogleDrivePickerToken(connection);
  const form = await pickGoogleForm(accessToken);
  if (!form) return null;
  return {
    id: form.id,
    name: form.name,
    mimeType: form.mimeType,
    connection_id: connection.id,
  };
}
