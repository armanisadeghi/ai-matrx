import { uploadFileWithProgress } from "./files";
import { uploadWithProgress } from "@/lib/python-client";

jest.mock("@/lib/python-client", () => ({
  uploadWithProgress: jest.fn(),
}));

jest.mock("@/lib/api/typed-client", () => ({
  apiDelete: jest.fn(),
  apiGet: jest.fn(),
  apiMultipart: jest.fn(),
  apiPost: jest.fn(),
  buildPath: jest.fn(),
  withQuery: jest.fn(),
}));

const mockedUpload = uploadWithProgress as jest.MockedFunction<
  typeof uploadWithProgress
>;

it("sends strict force-new-copy intent and reason in multipart", async () => {
  mockedUpload.mockResolvedValue({
    data: { file_id: "copy-2", file_path: "copy (1).txt" },
    meta: { requestId: "req-1", status: 200, serverRequestId: null },
  });
  const file = new File(["same bytes"], "copy.txt", { type: "text/plain" });

  await uploadFileWithProgress(
    {
      file,
      filePath: "copy (1).txt",
      intent: "force_new_copy",
      reason: "User selected Make a copy in the duplicate upload dialog",
    },
    jest.fn(),
  );

  const form = mockedUpload.mock.calls[0]?.[1] as FormData;
  expect(form.get("intent")).toBe("force_new_copy");
  expect(form.get("reason")).toBe(
    "User selected Make a copy in the duplicate upload dialog",
  );
});
