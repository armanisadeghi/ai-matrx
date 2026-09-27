import {
  GOOGLE_FORM_MIME_TYPE,
  type PickedGoogleForm,
} from "@/lib/googlePicker";
import { getGoogleDrivePickerToken } from "@/features/google-workspace/drivePickerToken";
import { pickGoogleForm } from "@/lib/googlePicker";
import {
  pickGoogleFormForConnection,
  type GoogleFormPickerConnection,
} from "./formPicker";

jest.mock("@/features/google-workspace/drivePickerToken", () => ({
  getGoogleDrivePickerToken: jest.fn(),
}));
jest.mock("@/lib/googlePicker", () => ({
  GOOGLE_FORM_MIME_TYPE: "application/vnd.google-apps.form",
  pickGoogleForm: jest.fn(),
}));

const chosenConnection: GoogleFormPickerConnection = {
  id: "chosen-connection",
  provider_subject: "chosen-subject",
  account_email: "chosen@example.com",
  account_name: "Chosen account",
};
const otherConnection: GoogleFormPickerConnection = {
  id: "other-connection",
  provider_subject: "other-subject",
  account_email: "other@example.com",
  account_name: "Other account",
};

beforeEach(() => {
  jest.mocked(getGoogleDrivePickerToken).mockReset();
  jest.mocked(pickGoogleForm).mockReset();
});

it("uses only the chosen connection's canonical Picker token and returns its identity", async () => {
  jest.mocked(getGoogleDrivePickerToken).mockResolvedValue("chosen-token");
  jest.mocked(pickGoogleForm).mockResolvedValue({
    id: "form-1",
    name: "Customer survey",
    mimeType: GOOGLE_FORM_MIME_TYPE,
    url: null,
  } satisfies PickedGoogleForm);

  await expect(pickGoogleFormForConnection(chosenConnection)).resolves.toEqual({
    id: "form-1",
    name: "Customer survey",
    mimeType: GOOGLE_FORM_MIME_TYPE,
    connection: chosenConnection,
  });
  expect(getGoogleDrivePickerToken).toHaveBeenCalledWith(chosenConnection);
  expect(getGoogleDrivePickerToken).not.toHaveBeenCalledWith(otherConnection);
  expect(pickGoogleForm).toHaveBeenCalledWith("chosen-token");
});

it("does not register anything when selection is cancelled", async () => {
  jest.mocked(getGoogleDrivePickerToken).mockResolvedValue("chosen-token");
  jest.mocked(pickGoogleForm).mockResolvedValue(null);

  await expect(pickGoogleFormForConnection(chosenConnection)).resolves.toBeNull();
  expect(getGoogleDrivePickerToken).toHaveBeenCalledWith(chosenConnection);
});
