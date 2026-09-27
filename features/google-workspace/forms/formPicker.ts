/**
 * Connection-bound entry point for the selected Google Form Picker.
 *
 * Forms are deliberately outside generic Workspace resource registration. The
 * caller receives only the selected Form and the exact Google identity whose
 * existing `drive.file` grant opened the Picker.
 */

import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { getGoogleDrivePickerToken } from "@/features/google-workspace/drivePickerToken";
import {
  pickGoogleForm,
  type PickedGoogleForm,
} from "@/lib/googlePicker";

export type GoogleFormPickerConnection = Pick<
  GoogleConnectionSummary,
  "id" | "provider_subject" | "account_email" | "account_name"
>;

export interface SelectedGoogleForm {
  id: string;
  name: string;
  mimeType: PickedGoogleForm["mimeType"];
  connection: GoogleFormPickerConnection;
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
    connection,
  };
}
