import {
  materializeGoogleDriveFile,
  materializeGoogleDriveFiles,
} from "@/features/google-workspace/import/materializeGoogleDriveFile";
import type { PickedGoogleDriveFile } from "@/lib/googlePicker";

const PICKED: PickedGoogleDriveFile = {
  id: "drive-file-1",
  name: "Quarterly plan",
  mimeType: "application/vnd.google-apps.document",
  url: "https://docs.google.com/document/d/drive-file-1/edit",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Google Drive file materialization", () => {
  afterEach(() => jest.restoreAllMocks());

  it("exports a selected Google Doc as an editable DOCX File", async () => {
    const fetchMock = jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          id: PICKED.id,
          name: PICKED.name,
          mimeType: PICKED.mimeType,
          modifiedTime: "2026-08-28T12:00:00.000Z",
          capabilities: { canDownload: true },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(["docx-bytes"]), { status: 200 }),
      );

    const file = await materializeGoogleDriveFile("picker-token", PICKED);

    expect(file.name).toBe("Quarterly plan.docx");
    expect(file.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/export?mimeType=");
  });

  it("downloads an ordinary Drive blob without converting its MIME type", async () => {
    const pickedPdf: PickedGoogleDriveFile = {
      ...PICKED,
      name: "Research.pdf",
      mimeType: "application/pdf",
    };
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          id: pickedPdf.id,
          name: pickedPdf.name,
          mimeType: pickedPdf.mimeType,
          capabilities: { canDownload: true },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(["pdf-bytes"], { type: "application/pdf" }), {
          status: 200,
        }),
      );

    const file = await materializeGoogleDriveFile("picker-token", pickedPdf);

    expect(file.name).toBe("Research.pdf");
    expect(file.type).toBe("application/pdf");
  });

  it("keeps supported selections when another selected type cannot export", async () => {
    const pickedForm: PickedGoogleDriveFile = {
      ...PICKED,
      id: "form-1",
      name: "Survey",
      mimeType: "application/vnd.google-apps.form",
    };
    jest
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse({
          id: PICKED.id,
          name: PICKED.name,
          mimeType: PICKED.mimeType,
          capabilities: { canDownload: true },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Blob(["docx-bytes"]), { status: 200 }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          id: pickedForm.id,
          name: pickedForm.name,
          mimeType: pickedForm.mimeType,
          capabilities: { canDownload: true },
        }),
      );

    const result = await materializeGoogleDriveFiles("picker-token", [
      PICKED,
      pickedForm,
    ]);

    expect(result.files).toHaveLength(1);
    expect(result.failures).toEqual([
      {
        name: "Survey",
        error:
          "Google Forms cannot be exported as files. Choose a response Sheet or another Drive file instead.",
      },
    ]);
  });
});
