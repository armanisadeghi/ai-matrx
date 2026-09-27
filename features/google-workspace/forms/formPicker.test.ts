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
};
const otherConnection: GoogleFormPickerConnection = {
  id: "other-connection",
};

beforeEach(() => {
  jest.mocked(getGoogleDrivePickerToken).mockReset();
  jest.mocked(pickGoogleForm).mockReset();
});

it("uses only the chosen connection's canonical Picker token and returns its ID", async () => {
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
    connection_id: chosenConnection.id,
  });
  expect(getGoogleDrivePickerToken).toHaveBeenCalledWith(chosenConnection);
  expect(getGoogleDrivePickerToken).not.toHaveBeenCalledWith(otherConnection);
  expect(pickGoogleForm).toHaveBeenCalledWith("chosen-token");
});

it("does not register anything when selection is cancelled", async () => {
  jest.mocked(getGoogleDrivePickerToken).mockResolvedValue("chosen-token");
  jest.mocked(pickGoogleForm).mockResolvedValue(null);

  await expect(
    pickGoogleFormForConnection(chosenConnection),
  ).resolves.toBeNull();
  expect(getGoogleDrivePickerToken).toHaveBeenCalledWith(chosenConnection);
});

it("does not promote caller-supplied account labels into verified Form provenance", async () => {
  jest.mocked(getGoogleDrivePickerToken).mockResolvedValue("other-token");
  jest.mocked(pickGoogleForm).mockResolvedValue({
    id: "form-2",
    name: "Harbor Dental intake",
    mimeType: GOOGLE_FORM_MIME_TYPE,
    url: null,
  } satisfies PickedGoogleForm);

  const untrustedDisplayFields = {
    ...otherConnection,
    provider_subject: "caller-claimed-subject",
    account_email: "caller-claimed@example.invalid",
    account_name: "Caller claimed account",
  };
  const result = await pickGoogleFormForConnection(untrustedDisplayFields);

  expect(result).toEqual({
    id: "form-2",
    name: "Harbor Dental intake",
    mimeType: GOOGLE_FORM_MIME_TYPE,
    connection_id: otherConnection.id,
  });
  expect(result).not.toHaveProperty("connection");
  expect(result).not.toHaveProperty("provider_subject");
  expect(result).not.toHaveProperty("account_email");
});
